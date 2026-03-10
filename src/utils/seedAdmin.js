const bcrypt = require('bcryptjs');
const {connectDb} = require('../config/db');
const env = require('../config/env');
const User = require('../models/User');

const ensureAdmin = async () => {
  const existing = await User.findOne({email: env.adminEmail.toLowerCase()});
  if (existing) {
    return existing;
  }

  const passwordHash = await bcrypt.hash(env.adminPassword, 10);
  return User.create({
    name: env.adminName,
    email: env.adminEmail.toLowerCase(),
    passwordHash,
    role: 'admin',
  });
};

const run = async () => {
  try {
    await connectDb();
    const admin = await ensureAdmin();
    // eslint-disable-next-line no-console
    console.log(`Admin ready: ${admin.email}`);
    process.exit(0);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  }
};

if (require.main === module) {
  run();
}

module.exports = {ensureAdmin};
