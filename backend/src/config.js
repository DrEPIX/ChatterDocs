import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  sessionSecret: process.env.SESSION_SECRET || 'insecure-development-secret',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  cookieSecure: process.env.NODE_ENV === 'production',
};
