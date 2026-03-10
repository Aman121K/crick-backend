const jwt = require('jsonwebtoken');
const env = require('../config/env');

const signToken = user => {
  return jwt.sign({sub: user._id, role: user.role, email: user.email}, env.jwtSecret, {expiresIn: '7d'});
};

module.exports = {signToken};
