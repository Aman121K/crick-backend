const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const {requireAuth} = require('../middleware/auth');
const {signToken} = require('../utils/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const {name, email, password} = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({message: 'name, email and password are required'});
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({email: normalizedEmail});
    if (existing) {
      return res.status(409).json({message: 'User already exists'});
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'user',
      lastLoginAt: new Date(),
    });

    const token = signToken(user);
    return res.status(201).json({
      token,
      user: {id: user._id, name: user.name, email: user.email, role: user.role},
    });
  } catch (error) {
    return res.status(500).json({message: 'Failed to register'});
  }
});

router.post('/login', async (req, res) => {
  try {
    const {email, password} = req.body;
    if (!email || !password) {
      return res.status(400).json({message: 'email and password are required'});
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({email: normalizedEmail});
    if (!user) {
      return res.status(401).json({message: 'Invalid credentials'});
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({message: 'Invalid credentials'});
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    return res.json({
      token,
      user: {id: user._id, name: user.name, email: user.email, role: user.role},
    });
  } catch (error) {
    return res.status(500).json({message: 'Failed to login'});
  }
});

router.get('/me', requireAuth, async (req, res) => {
  return res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

module.exports = router;
