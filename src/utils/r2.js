const crypto = require('crypto');
const path = require('path');
const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3');
const env = require('../config/env');

const getR2ConfigStatus = () => {
  const missing = [];

  if (!env.r2Endpoint) {
    missing.push('R2_ENDPOINT');
  }
  if (!env.r2Bucket) {
    missing.push('R2_BUCKET');
  }
  if (!env.r2AccessKeyId) {
    missing.push('R2_ACCESS_KEY_ID');
  }
  if (!env.r2SecretAccessKey) {
    missing.push('R2_SECRET_ACCESS_KEY');
  }

  return {
    configured: missing.length === 0,
    missing,
  };
};

const isR2Configured = () => {
  return getR2ConfigStatus().configured;
};

const getPublicBase = () => {
  if (!env.r2PublicBaseUrl) {
    return '';
  }

  return String(env.r2PublicBaseUrl).trim().replace(/\/+$/, '');
};

const normalizeEndpoint = (rawEndpoint, bucketName) => {
  const endpoint = String(rawEndpoint || '').trim().replace(/\/+$/, '');
  if (!endpoint) {
    return '';
  }

  const bucket = String(bucketName || '').trim();
  if (!bucket) {
    return endpoint;
  }

  const bucketSuffix = `/${bucket}`;
  if (endpoint.endsWith(bucketSuffix)) {
    return endpoint.slice(0, -bucketSuffix.length);
  }

  return endpoint;
};

const mimeToExt = mimeType => {
  const normalized = String(mimeType || '').toLowerCase();
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };

  return map[normalized] || '';
};

const safeExtFromName = fileName => {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext.replace('.jpeg', '.jpg') : '';
};

const buildKey = ({originalName, mimeType}) => {
  const ext = mimeToExt(mimeType) || safeExtFromName(originalName) || '.jpg';
  const date = new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const random = crypto.randomBytes(10).toString('hex');
  return `${env.r2KeyPrefix}/${y}/${m}/${d}/${random}${ext}`;
};

const getS3Client = () => {
  const endpoint = normalizeEndpoint(env.r2Endpoint, env.r2Bucket);
  return new S3Client({
    region: env.r2Region || 'auto',
    endpoint,
    credentials: {
      accessKeyId: env.r2AccessKeyId,
      secretAccessKey: env.r2SecretAccessKey,
    },
  });
};

const buildPublicUrl = key => {
  const publicBase = getPublicBase();
  if (publicBase) {
    return `${publicBase}/${key}`;
  }

  const endpoint = normalizeEndpoint(env.r2Endpoint, env.r2Bucket);
  return `${endpoint}/${env.r2Bucket}/${key}`;
};

const uploadNewsImage = async ({buffer, mimeType, originalName}) => {
  if (!isR2Configured()) {
    throw new Error('R2 is not configured');
  }

  const key = buildKey({originalName, mimeType});
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return {key, url: buildPublicUrl(key)};
};

module.exports = {
  isR2Configured,
  getR2ConfigStatus,
  normalizeEndpoint,
  uploadNewsImage,
  getPublicBase,
};
