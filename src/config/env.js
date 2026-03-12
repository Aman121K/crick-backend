const path = require('path');
const dotenv = require('dotenv');

dotenv.config({path: path.resolve(process.cwd(), '.env')});
dotenv.config({path: path.resolve(__dirname, '../../.env')});

const asPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const env = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/cricbuzz_admin',
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@mycricket.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin@123',
  adminName: process.env.ADMIN_NAME || 'Super Admin',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  r2Endpoint:
    process.env.R2_ENDPOINT || 'https://72b2bc9b88cbd4ffb61195d1a5d60807.r2.cloudflarestorage.com',
  r2Bucket: process.env.R2_BUCKET || 'criclive',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '2db8bb16590f85fbe0ac59de3a7c1ad9',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'b396d1672b56fe02c8bdd6236d0d79799752f564905855a9cfaa8ee13f9db4fc',
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL || '',
  r2Region: process.env.R2_REGION || 'auto',
  r2KeyPrefix: process.env.R2_KEY_PREFIX || 'news',
  maxImageUploadBytes: asPositiveNumber(process.env.MAX_IMAGE_UPLOAD_BYTES, 15 * 1024 * 1024),
  enforceR2NewsImages: String(process.env.ENFORCE_R2_NEWS_IMAGES || 'false').toLowerCase() === 'true',
};

module.exports = env;
