import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import auth from './routes/auth.js';
import courses from './routes/courses.js';
import learning from './routes/learning.js';
import quizzes from './routes/quizzes.js';
import admin from './routes/admin.js';
import platform from './routes/platform.js';
import instructorInvitations from './routes/instructorInvitations.js';
import { notFound, errorHandler } from './middleware/errors.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.clientUrl.split(',').map(x=>x.trim()), credentials: true }));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan(process.env.NODE_ENV==='production'?'combined':'dev'));

app.use('/api/auth', rateLimit({ windowMs:15*60*1000, limit:30, standardHeaders:true }), auth);
app.use('/api/courses', courses);
app.use('/api/learning', learning);
app.use('/api/quizzes', quizzes);
// Admin alias uses the same invitation router and its existing JWT + admin middleware.
app.use('/api/admin/instructor-invitations', instructorInvitations);
app.use('/api/admin', admin);
app.use('/api/instructor-invitations', instructorInvitations);
app.get('/api/health', (req,res)=>res.json({ status:'ok', database:mongoose.connection.readyState===1?'connected':'disconnected', time:new Date().toISOString() }));
app.use('/api', platform);

if (process.env.NODE_ENV === 'production') {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  app.use(express.static(dir));
  app.get('/*splat', (req,res)=>res.sendFile(path.join(dir,'index.html')));
} else app.use(notFound);
app.use(errorHandler);

export default app;
