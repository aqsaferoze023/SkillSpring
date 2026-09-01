import { Router } from 'express';
import User from '../models/User.js';
import Course from '../models/Course.js';
import { Enrollment } from '../models/Learning.js';
import { InstructorCapacity } from '../models/InstructorInvitation.js';
import { protect, allow } from '../middleware/auth.js';

const r = Router();
r.use(protect, allow('admin'));

r.get('/overview', async (req, res) => {
  const [users, students, instructors, courses, enrollments, pendingCourses, pendingInstructorApprovals, quota] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'instructor' }),
    Course.countDocuments({ status: 'published' }),
    Enrollment.countDocuments(),
    Course.countDocuments({ status: 'pending' }),
    User.countDocuments({ role: 'instructor', status: 'pending' }),
    InstructorCapacity.findById('instructors')
  ]);
  res.json({
    users, students, instructors, courses, enrollments, pendingCourses,
    pendingInstructors: pendingInstructorApprovals,
    instructorCapacity: { used: quota?.used ?? instructors, max: 5, available: Math.max(0, 5-(quota?.used ?? instructors)) }
  });
});

r.get('/instructors', async (req, res) => {
  const instructors = await User.aggregate([
    { $match: { role: 'instructor' } },
    { $lookup: { from: 'courses', localField: '_id', foreignField: 'instructor', as: 'courses' } },
    { $project: { name: 1, email: 1, avatar: 1, status: 1, createdAt: 1, lastActiveAt: 1, courseCount: { $size: '$courses' } } },
    { $sort: { name: 1 } }
  ]);
  res.json({ instructors });
});

r.delete('/instructors/:id', async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'instructor' });
  if (!user) return res.status(404).json({ message: 'Instructor not found' });
  user.role = 'student';
  user.status = 'active';
  await user.save();
  await InstructorCapacity.updateOne({ _id: 'instructors', used: { $gt: 0 } }, { $inc: { used: -1 } });
  res.json({ message: 'Instructor access removed', user });
});

r.get('/users', async (req, res) => {
  const { role, status, q, page=1 } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (q) filter.$or = [{ name: new RegExp(q,'i') }, { email: new RegExp(q,'i') }];
  res.json({ items: await User.find(filter).sort('-createdAt').skip((page-1)*25).limit(25), total: await User.countDocuments(filter) });
});

r.patch('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  // Instructor promotion is invitation-only. Admin promotion is never available here.
  if (req.body.role && req.body.role !== user.role) return res.status(400).json({ message: 'Roles cannot be changed through the user profile API' });
  if (req.body.status) user.status = req.body.status;
  await user.save();
  res.json({ user });
});

r.get('/courses/pending', async (req, res) => res.json({ items: await Course.find({ status:'pending' }).populate('instructor','name email') }));
r.patch('/courses/:id/review', async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message:'Course not found' });
  course.status = req.body.approved ? 'published' : 'rejected';
  if (req.body.approved) course.publishedAt = new Date();
  await course.save();
  res.json({ course });
});

export default r;
