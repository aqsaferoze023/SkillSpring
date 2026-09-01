import mongoose from 'mongoose';
import app from './app.js';
import { env, validateEnv } from './config/env.js';

validateEnv();
await mongoose.connect(env.mongoUri);
console.log('MongoDB connected');

const server = app.listen(env.port, '0.0.0.0', ()=>console.log(`SkillSpring API listening on ${env.port}`));
const shutdown = ()=>server.close(()=>mongoose.connection.close().then(()=>process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
