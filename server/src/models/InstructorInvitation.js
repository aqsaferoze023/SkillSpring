import mongoose from 'mongoose';

const invitationSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'cancelled', 'expired'], default: 'pending', index: true },
  expiresAt: { type: Date, required: true, index: true },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acceptedAt: Date,
  cancelledAt: Date,
  lastSentAt: { type: Date, default: Date.now },
  sendCount: { type: Number, default: 1 }
}, { timestamps: true });

// Only one live/pending invitation per email. Historical records remain available.
invitationSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

const capacitySchema = new mongoose.Schema({
  _id: { type: String, default: 'instructors' },
  used: { type: Number, default: 0, min: 0, max: 5 },
  max: { type: Number, default: 5, immutable: true }
}, { timestamps: true });

export const InstructorInvitation = mongoose.model('InstructorInvitation', invitationSchema);
export const InstructorCapacity = mongoose.model('InstructorCapacity', capacitySchema);
