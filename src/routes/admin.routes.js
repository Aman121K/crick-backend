const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const User = require('../models/User');
const News = require('../models/News');
const {requireAuth, requireAdmin} = require('../middleware/auth');
const {signToken} = require('../utils/auth');
const env = require('../config/env');
const {getPublicBase, isR2Configured, getR2ConfigStatus, uploadNewsImage} = require('../utils/r2');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: env.maxImageUploadBytes},
});
const NEWS_UPLOAD_FIELDS = [
  {name: 'file', maxCount: 1},
  {name: 'image', maxCount: 1},
  {name: 'thumbnail', maxCount: 1},
  {name: 'thumbnailFile', maxCount: 1},
];
const uploadSingleImage = (req, res) =>
  new Promise((resolve, reject) => {
    upload.single('file')(req, res, error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
const uploadNewsMedia = (req, res) =>
  new Promise((resolve, reject) => {
    upload.fields(NEWS_UPLOAD_FIELDS)(req, res, error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const normalizeUrl = value => {
  if (!value) {
    return '';
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return '';
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    throw new Error('Invalid image URL format');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Image URL must use http or https');
  }

  const base = getPublicBase();
  if (env.enforceR2NewsImages && base && !normalized.startsWith(`${base}/`)) {
    throw new Error('Image URL must be from configured R2 public base');
  }

  return normalized;
};

const stripHtml = value =>
  String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildSummary = (providedSummary, content, title) => {
  const explicit = String(providedSummary || '').trim();
  if (explicit) {
    return explicit;
  }

  const source = stripHtml(content) || String(title || '').trim();
  if (!source) {
    return '';
  }

  return source.length > 180 ? `${source.slice(0, 177)}...` : source;
};

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const handleUploadError = (error, res) => {
  const uploadError = {
    message: error?.message || 'Unknown upload error',
    code: error?.code || error?.name || 'UNKNOWN',
    statusCode: error?.$metadata?.httpStatusCode || null,
    requestId: error?.$metadata?.requestId || null,
  };

  // eslint-disable-next-line no-console
  console.error('R2 upload failed', uploadError);

  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res
      .status(413)
      .json({message: `Image too large. Max size is ${Math.round(env.maxImageUploadBytes / (1024 * 1024))}MB`});
  }
  if (error?.name === 'MulterError') {
    return res.status(400).json({message: error?.message || 'Invalid file upload payload'});
  }

  return res.status(500).json({message: 'Failed to upload image', error: uploadError});
};

const getUploadedFile = (files, keys = []) => {
  for (const key of keys) {
    const file = files?.[key]?.[0];
    if (file) {
      return file;
    }
  }
  return null;
};

const assertAllowedImage = file => {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error('Only JPG, PNG, WEBP, or GIF files are allowed');
  }
  return mimeType;
};

const parseBooleanLike = value => {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (['true', '1', 'yes'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }
  return undefined;
};

router.post('/login', async (req, res) => {
  try {
    const {email, password} = req.body;
    if (!email || !password) {
      return res.status(400).json({message: 'email and password are required'});
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    let admin = await User.findOne({email: normalizedEmail, role: 'admin'});

    const isSeedAdminLogin =
      normalizedEmail === env.adminEmail.toLowerCase().trim() && password === env.adminPassword;

    if (!admin && isSeedAdminLogin) {
      const passwordHash = await bcrypt.hash(env.adminPassword, 10);
      admin = await User.findOneAndUpdate(
        {email: normalizedEmail},
        {
          name: env.adminName,
          email: normalizedEmail,
          passwordHash,
          role: 'admin',
        },
        {new: true, upsert: true, setDefaultsOnInsert: true}
      );
    }

    if (!admin) {
      return res.status(401).json({message: 'Invalid admin credentials'});
    }

    let isValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isValid && isSeedAdminLogin) {
      admin.passwordHash = await bcrypt.hash(env.adminPassword, 10);
      admin.role = 'admin';
      isValid = true;
    }

    if (!isValid) {
      return res.status(401).json({message: 'Invalid admin credentials'});
    }

    admin.lastLoginAt = new Date();
    await admin.save();

    const token = signToken(admin);
    return res.json({
      token,
      user: {id: admin._id, name: admin.name, email: admin.email, role: admin.role},
    });
  } catch (error) {
    return res.status(500).json({message: 'Failed to login'});
  }
});

router.get('/users', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const users = await User.find({role: 'user'})
      .sort({createdAt: -1})
      .select('_id name email role createdAt lastLoginAt');

    return res.json({items: users});
  } catch (error) {
    return res.status(500).json({message: 'Failed to fetch users'});
  }
});

router.get('/news', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const items = await News.find({})
      .sort({createdAt: -1})
      .populate('createdBy', 'name email');

    return res.json({items});
  } catch (error) {
    return res.status(500).json({message: 'Failed to fetch news'});
  }
});

router.post('/news/upload-image', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!isR2Configured()) {
      const status = getR2ConfigStatus();
      return res.status(503).json({
        message: 'R2 storage is not configured on server',
        missing: status.missing,
      });
    }

    await uploadSingleImage(req, res);

    if (!req.file) {
      return res.status(400).json({message: 'Image file is required'});
    }

    const mimeType = String(req.file.mimetype || '').toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      return res.status(400).json({message: 'Only JPG, PNG, WEBP, or GIF files are allowed'});
    }

    const {url, key} = await uploadNewsImage({
      buffer: req.file.buffer,
      mimeType,
      originalName: req.file.originalname,
    });

    return res.status(201).json({
      url,
      key,
      contentType: mimeType,
      size: req.file.size,
    });
  } catch (error) {
    return handleUploadError(error, res);
  }
});

router.post('/news', requireAuth, requireAdmin, async (req, res) => {
  try {
    await uploadNewsMedia(req, res);

    const imageFile = getUploadedFile(req.files, ['image', 'file']);
    const thumbnailFile = getUploadedFile(req.files, ['thumbnail', 'thumbnailFile']);

    if ((imageFile || thumbnailFile) && !isR2Configured()) {
      const status = getR2ConfigStatus();
      return res.status(503).json({
        message: 'R2 storage is not configured on server',
        missing: status.missing,
      });
    }

    const {
      title,
      summary = '',
      content = '',
      imageUrl = '',
      thumbnailUrl = '',
      tag = 'MYCRICKET',
      isPublished = true,
    } = req.body;

    if (!title) {
      return res.status(400).json({message: 'title is required'});
    }

    const uploadedImage =
      imageFile &&
      (await uploadNewsImage({
        buffer: imageFile.buffer,
        mimeType: assertAllowedImage(imageFile),
        originalName: imageFile.originalname,
      }));
    const uploadedThumbnail =
      thumbnailFile &&
      (await uploadNewsImage({
        buffer: thumbnailFile.buffer,
        mimeType: assertAllowedImage(thumbnailFile),
        originalName: thumbnailFile.originalname,
      }));

    const normalizedImageUrl = normalizeUrl(uploadedImage?.url || imageUrl);
    const normalizedThumbnailUrl = normalizeUrl(uploadedThumbnail?.url || thumbnailUrl || normalizedImageUrl);
    const normalizedTitle = String(title).trim();
    const normalizedContent = String(content).trim();
    const normalizedIsPublished = parseBooleanLike(isPublished);

    const item = await News.create({
      title: normalizedTitle,
      summary: buildSummary(summary, normalizedContent, normalizedTitle),
      content: normalizedContent,
      imageUrl: normalizedImageUrl,
      thumbnailUrl: normalizedThumbnailUrl,
      tag: String(tag).trim() || 'MYCRICKET',
      isPublished: normalizedIsPublished === undefined ? true : normalizedIsPublished,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      item,
      uploads: {
        image: uploadedImage || null,
        thumbnail: uploadedThumbnail || null,
      },
    });
  } catch (error) {
    if (error?.code === 'LIMIT_FILE_SIZE' || error?.$metadata || error?.name === 'MulterError') {
      return handleUploadError(error, res);
    }
    if (String(error.message || '').toLowerCase().includes('image url')) {
      return res.status(400).json({message: error.message});
    }
    if (String(error.message || '').toLowerCase().includes('only jpg')) {
      return res.status(400).json({message: error.message});
    }
    return res.status(500).json({message: 'Failed to create news'});
  }
});

router.patch('/news/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await uploadNewsMedia(req, res);

    const imageFile = getUploadedFile(req.files, ['image', 'file']);
    const thumbnailFile = getUploadedFile(req.files, ['thumbnail', 'thumbnailFile']);

    if ((imageFile || thumbnailFile) && !isR2Configured()) {
      const status = getR2ConfigStatus();
      return res.status(503).json({
        message: 'R2 storage is not configured on server',
        missing: status.missing,
      });
    }

    const {title, summary = '', content = '', imageUrl = '', thumbnailUrl = '', tag = 'MYCRICKET', isPublished} = req.body;
    const normalizedTitle = String(title || '').trim();

    if (!normalizedTitle) {
      return res.status(400).json({message: 'title is required'});
    }

    const uploadedImage =
      imageFile &&
      (await uploadNewsImage({
        buffer: imageFile.buffer,
        mimeType: assertAllowedImage(imageFile),
        originalName: imageFile.originalname,
      }));
    const uploadedThumbnail =
      thumbnailFile &&
      (await uploadNewsImage({
        buffer: thumbnailFile.buffer,
        mimeType: assertAllowedImage(thumbnailFile),
        originalName: thumbnailFile.originalname,
      }));

    const normalizedImageUrl = normalizeUrl(uploadedImage?.url || imageUrl);
    const normalizedThumbnailUrl = normalizeUrl(uploadedThumbnail?.url || thumbnailUrl || normalizedImageUrl);
    const normalizedContent = String(content).trim();
    const normalizedIsPublished = parseBooleanLike(isPublished);

    const item = await News.findByIdAndUpdate(
      req.params.id,
      {
        title: normalizedTitle,
        summary: buildSummary(summary, normalizedContent, normalizedTitle),
        content: normalizedContent,
        imageUrl: normalizedImageUrl,
        thumbnailUrl: normalizedThumbnailUrl,
        tag: String(tag).trim() || 'MYCRICKET',
        ...(normalizedIsPublished !== undefined ? {isPublished: normalizedIsPublished} : {}),
      },
      {new: true}
    );

    if (!item) {
      return res.status(404).json({message: 'News not found'});
    }

    return res.json({
      item,
      uploads: {
        image: uploadedImage || null,
        thumbnail: uploadedThumbnail || null,
      },
    });
  } catch (error) {
    if (error?.code === 'LIMIT_FILE_SIZE' || error?.$metadata || error?.name === 'MulterError') {
      return handleUploadError(error, res);
    }
    if (String(error.message || '').toLowerCase().includes('image url')) {
      return res.status(400).json({message: error.message});
    }
    if (String(error.message || '').toLowerCase().includes('only jpg')) {
      return res.status(400).json({message: error.message});
    }
    return res.status(500).json({message: 'Failed to update news'});
  }
});

router.delete('/news/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const item = await News.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({message: 'News not found'});
    }

    return res.json({ok: true});
  } catch (error) {
    return res.status(500).json({message: 'Failed to delete news'});
  }
});

router.patch('/news/:id/publish', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {isPublished} = req.body;

    const item = await News.findByIdAndUpdate(
      req.params.id,
      {isPublished: Boolean(isPublished)},
      {new: true}
    );

    if (!item) {
      return res.status(404).json({message: 'News not found'});
    }

    return res.json({item});
  } catch (error) {
    return res.status(500).json({message: 'Failed to update news'});
  }
});

module.exports = router;
