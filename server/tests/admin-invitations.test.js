import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-integration';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.APP_URL = 'http://localhost:5173';

let mongo, app, User, Invitation, signToken;
let admin, student, otherStudent, existingInstructor;
const auth = user => ({ Authorization: `Bearer ${signToken(user)}` });

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ default: app } = await import('../src/app.js'));
  ({ default: User } = await import('../src/models/User.js'));
  ({ InstructorInvitation: Invitation } = await import('../src/models/InstructorInvitation.js'));
  ({ signToken } = await import('../src/utils/helpers.js'));
  [admin, student, otherStudent, existingInstructor] = await User.create([
    { name:'Admin', email:'admin@test.dev', password:'password123', role:'admin', status:'active' },
    { name:'Invited Student', email:'invite@test.dev', password:'password123', role:'student', status:'active' },
    { name:'Other Student', email:'other@test.dev', password:'password123', role:'student', status:'active' },
    { name:'Existing Instructor', email:'teacher@test.dev', password:'password123', role:'instructor', status:'active' }
  ]);
});

after(async () => { await mongoose.disconnect(); await mongo.stop(); });

test('registration remains student-only and rejects role injection', async () => {
  const normal = await request(app).post('/api/auth/register').send({ name:'New User', email:'new@test.dev', password:'password123' });
  assert.equal(normal.status, 201); assert.equal(normal.body.user.role, 'student');
  const injected = await request(app).post('/api/auth/register').send({ name:'Attacker', email:'attacker@test.dev', password:'password123', role:'admin' });
  assert.equal(injected.status, 400);
});

test('admin APIs reject students and instructors', async () => {
  for (const user of [student, existingInstructor]) {
    const result = await request(app).get('/api/admin/instructors').set(auth(user));
    assert.equal(result.status, 403);
  }
  const allowed = await request(app).get('/api/admin/instructors').set(auth(admin));
  assert.equal(allowed.status, 200);
});

test('admin can invite, duplicate is blocked, resend works, and cancellation releases the slot', async () => {
  const created = await request(app).post('/api/admin/instructor-invitations').set(auth(admin)).send({ email:'cancel@test.dev' });
  assert.equal(created.status, 201); assert.ok(created.body.inviteUrl);
  const duplicate = await request(app).post('/api/admin/instructor-invitations').set(auth(admin)).send({ email:'cancel@test.dev' });
  assert.equal(duplicate.status, 409);
  const id = created.body.invitation._id;
  const resent = await request(app).post(`/api/admin/instructor-invitations/${id}/resend`).set(auth(admin));
  assert.equal(resent.status, 200); assert.equal(resent.body.invitation.sendCount, 2);
  const cancelled = await request(app).delete(`/api/admin/instructor-invitations/${id}`).set(auth(admin));
  assert.equal(cancelled.status, 200); assert.equal(cancelled.body.invitation.status, 'cancelled');
});

test('invitation is email-bound, single-use, and promotes only the matching student', async () => {
  const created = await request(app).post('/api/admin/instructor-invitations').set(auth(admin)).send({ email:student.email });
  const token = created.body.inviteUrl.split('/').pop();
  const wrong = await request(app).post(`/api/instructor-invitations/${token}/accept`).set(auth(otherStudent));
  assert.equal(wrong.status, 403);
  const accepted = await request(app).post(`/api/instructor-invitations/${token}/accept`).set(auth(student));
  assert.equal(accepted.status, 200); assert.equal(accepted.body.user.role, 'instructor');
  const reused = await request(app).post(`/api/instructor-invitations/${token}/accept`).set(auth(student));
  assert.equal(reused.status, 409);
  const fresh = await User.findById(student._id); assert.equal(fresh.role, 'instructor');
});

test('expired invitation cannot be accepted', async () => {
  const created = await request(app).post('/api/admin/instructor-invitations').set(auth(admin)).send({ email:otherStudent.email });
  const token = created.body.inviteUrl.split('/').pop();
  await Invitation.updateOne({ _id:created.body.invitation._id }, { expiresAt:new Date(Date.now()-1000) });
  const expired = await request(app).post(`/api/instructor-invitations/${token}/accept`).set(auth(otherStudent));
  assert.equal(expired.status, 410);
});

test('backend enforces five combined active and pending instructor slots', async () => {
  // Two active instructors exist now. Add three pending reservations.
  for (const email of ['slot1@test.dev','slot2@test.dev','slot3@test.dev']) {
    const result = await request(app).post('/api/admin/instructor-invitations').set(auth(admin)).send({ email });
    assert.equal(result.status, 201);
  }
  const full = await request(app).post('/api/admin/instructor-invitations').set(auth(admin)).send({ email:'slot4@test.dev' });
  assert.equal(full.status, 409);
  assert.equal(full.body.message, 'Maximum 5 instructors are allowed.');
});
