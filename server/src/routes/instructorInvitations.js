import { Router } from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import { InstructorInvitation, InstructorCapacity } from '../models/InstructorInvitation.js';
import { protect, allow } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { sendInstructorInvitationEmail } from '../services/invitationEmail.js';

const r = Router();
const MAX_INSTRUCTORS = 5;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const makeToken = () => crypto.randomBytes(32).toString('hex');

async function ensureCapacity() {
  let quota = await InstructorCapacity.findById('instructors');
  if (!quota) {
    const active = await User.countDocuments({ role: 'instructor', status: { $ne: 'suspended' } });
    try { quota = await InstructorCapacity.create({ _id: 'instructors', used: Math.min(active, MAX_INSTRUCTORS), max: MAX_INSTRUCTORS }); }
    catch { quota = await InstructorCapacity.findById('instructors'); }
  }
  return quota;
}

async function expireOldInvitations() {
  const result = await InstructorInvitation.updateMany(
    { status: 'pending', expiresAt: { $lte: new Date() } },
    { $set: { status: 'expired' } }
  );
  if (result.modifiedCount) {
    await InstructorCapacity.updateOne(
      { _id: 'instructors' },
      [{ $set: { used: { $max: [0, { $subtract: ['$used', result.modifiedCount] }] } } }]
    );
  }
}

// Acceptance is authenticated and email-bound. Possessing another person's link is insufficient.
r.post('/:token/accept', protect, async (req, res) => {
  if (req.user.role !== 'student') return res.status(409).json({ message: 'Only student accounts can accept instructor invitations' });
  const tokenHash = hash(req.params.token);
  const invitation = await InstructorInvitation.findOne({ tokenHash }).select('+tokenHash');
  if (!invitation) return res.status(404).json({ message: 'Invitation not found' });
  if (invitation.status !== 'pending') return res.status(409).json({ message: `This invitation is ${invitation.status}` });
  if (invitation.expiresAt <= new Date()) {
    invitation.status = 'expired'; await invitation.save();
    await InstructorCapacity.updateOne({ _id: 'instructors', used: { $gt: 0 } }, { $inc: { used: -1 } });
    return res.status(410).json({ message: 'This invitation has expired' });
  }
  if (invitation.email !== req.user.email.toLowerCase()) return res.status(403).json({ message: 'This invitation belongs to a different email address' });

  const accepted = await InstructorInvitation.findOneAndUpdate(
    { _id: invitation._id, status: 'pending', expiresAt: { $gt: new Date() } },
    { $set: { status: 'accepted', acceptedBy: req.user._id, acceptedAt: new Date() } },
    { new: true }
  );
  if (!accepted) return res.status(409).json({ message: 'Invitation has already been used' });
  req.user.role = 'instructor';
  req.user.status = 'active';
  await req.user.save();
  res.json({ message: 'Instructor invitation accepted', user: req.user });
});

r.use(protect, allow('admin'));

r.get('/', async (req, res) => {
  await ensureCapacity(); await expireOldInvitations();
  const [quota, instructors, invitations] = await Promise.all([
    InstructorCapacity.findById('instructors'),
    User.find({ role: 'instructor' }).select('name email avatar status createdAt lastActiveAt').sort('name'),
    InstructorInvitation.find({ status: { $in: ['pending', 'expired'] } }).populate('invitedBy', 'name email').sort('-createdAt')
  ]);
  const active = instructors.filter(x => x.status !== 'suspended').length;
  res.json({ limit: MAX_INSTRUCTORS, used: quota.used, active, available: Math.max(0, MAX_INSTRUCTORS - quota.used), instructors, invitations });
});

r.post('/', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'A valid email is required' });
  await ensureCapacity(); await expireOldInvitations();
  const existingUser = await User.findOne({ email });
  if (existingUser?.role === 'instructor') return res.status(409).json({ message: 'This user is already an instructor' });
  if (existingUser?.role === 'admin') return res.status(409).json({ message: 'Administrators cannot be invited as instructors' });
  if (await InstructorInvitation.exists({ email, status: 'pending', expiresAt: { $gt: new Date() } })) return res.status(409).json({ message: 'A pending invitation already exists for this email' });

  const reserved = await InstructorCapacity.findOneAndUpdate(
    { _id: 'instructors', used: { $lt: MAX_INSTRUCTORS } },
    { $inc: { used: 1 } }, { new: true }
  );
  if (!reserved) return res.status(409).json({ message: 'Maximum 5 instructors are allowed.' });

  const token = makeToken();
  let invitation;
  try {
    invitation = await InstructorInvitation.create({ email, tokenHash: hash(token), invitedBy: req.user._id, expiresAt: new Date(Date.now() + DAYS_7) });
    const inviteUrl = `${env.appUrl}/invitations/instructor/${token}`;
    await sendInstructorInvitationEmail({ email, inviteUrl, inviterName: req.user.name });
    const payload = { invitation, capacity: reserved };
    if (process.env.NODE_ENV !== 'production') payload.inviteUrl = inviteUrl;
    res.status(201).json(payload);
  } catch (error) {
    if (invitation) await InstructorInvitation.deleteOne({ _id: invitation._id });
    await InstructorCapacity.updateOne({ _id: 'instructors', used: { $gt: 0 } }, { $inc: { used: -1 } });
    throw error;
  }
});

r.post('/:id/resend', async (req, res) => {
  const invitation = await InstructorInvitation.findOne({ _id: req.params.id, status: 'pending' });
  if (!invitation) return res.status(404).json({ message: 'Pending invitation not found' });
  const token = makeToken();
  invitation.tokenHash = hash(token);
  invitation.expiresAt = new Date(Date.now() + DAYS_7);
  invitation.lastSentAt = new Date();
  invitation.sendCount += 1;
  await invitation.save();
  const inviteUrl = `${env.appUrl}/invitations/instructor/${token}`;
  await sendInstructorInvitationEmail({ email: invitation.email, inviteUrl, inviterName: req.user.name });
  const payload = { invitation };
  if (process.env.NODE_ENV !== 'production') payload.inviteUrl = inviteUrl;
  res.json(payload);
});

r.delete('/:id', async (req, res) => {
  const invitation = await InstructorInvitation.findOneAndUpdate(
    { _id: req.params.id, status: 'pending' },
    { $set: { status: 'cancelled', cancelledAt: new Date() } },
    { new: true }
  );
  if (!invitation) return res.status(404).json({ message: 'Pending invitation not found' });
  await InstructorCapacity.updateOne({ _id: 'instructors', used: { $gt: 0 } }, { $inc: { used: -1 } });
  res.json({ invitation });
});

r.delete('/instructors/:userId/access', async (req, res) => {
  const user = await User.findOne({ _id: req.params.userId, role: 'instructor' });
  if (!user) return res.status(404).json({ message: 'Instructor not found' });
  user.role = 'student'; user.status = 'active'; await user.save();
  await InstructorCapacity.updateOne({ _id: 'instructors', used: { $gt: 0 } }, { $inc: { used: -1 } });
  res.json({ message: 'Instructor access removed', user });
});

export default r;
