import 'dotenv/config';
const required=['MONGODB_URI','JWT_SECRET'];
export function validateEnv(){const missing=required.filter(k=>!process.env[k]);if(missing.length)throw new Error(`Missing required environment variables: ${missing.join(', ')}`)}
export const env={port:Number(process.env.PORT||5000),mongoUri:process.env.MONGODB_URI,jwtSecret:process.env.JWT_SECRET,jwtExpires:process.env.JWT_EXPIRES_IN||'7d',clientUrl:process.env.CLIENT_URL||'http://localhost:5173',aiBaseUrl:process.env.AI_BASE_URL||'https://api.openai.com/v1',aiModel:process.env.AI_MODEL||'gpt-4o-mini',aiKey:process.env.AI_API_KEY,appUrl:process.env.APP_URL||'http://localhost:5173',emailApiKey:process.env.EMAIL_API_KEY,emailFrom:process.env.EMAIL_FROM||'SkillSpring <invitations@skillspring.example>'};
