const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');

const requireAuth = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    if (!token) {
      return res.status(401).json({message: 'Missing token'});
    }

    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub).select('_id name email role');
    if (!user) {
      return res.status(401).json({message: 'Invalid token'});
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({message: 'Unauthorized'});
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({message: 'Admin access required'});
  }
  return next();
};

module.exports = {requireAuth, requireAdmin};
