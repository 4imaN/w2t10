const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');
const { hashPassword, comparePassword } = require('../utils/crypto');
const { UnauthorizedError, NotFoundError, ValidationError } = require('../utils/errors');

const { getJwtSecret } = require('../utils/env');
const JWT_SECRET = getJwtSecret();
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';

// Maps portal identifiers to the roles allowed to log in through them
const PORTAL_ROLE_MAP = {
  admin: ['administrator'],
  editor: ['editor'],
  reviewer: ['reviewer'],
  dispatcher: ['dispatcher'],
  user: ['regular_user']
};

async function login(username, password, portal = null) {
  const user = await User.findOne({ username, deleted_at: null, status: 'active' });
  if (!user) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const isMatch = await comparePassword(password, user.password_hash);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid credentials');
  }

  // Enforce portal-role match
  if (portal && PORTAL_ROLE_MAP[portal]) {
    if (!PORTAL_ROLE_MAP[portal].includes(user.role)) {
      throw new UnauthorizedError(
        `This login portal is for ${PORTAL_ROLE_MAP[portal].join('/')} accounts only. Your account role (${user.role}) does not match.`
      );
    }
  }

  const token = jwt.sign(
    { userId: user._id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRATION }
  );

  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000);

  await Session.create({
    user_id: user._id,
    token,
    expires_at: expiresAt
  });

  return {
    token,
    expires_at: expiresAt,
    must_change_password: !!user.must_change_password,
    user: {
      id: user._id,
      username: user.username,
      role: user.role,
      display_name: user.display_name
    }
  };
}

async function logout(token) {
  await Session.findOneAndUpdate({ token }, { revoked: true });
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');

  const isMatch = await comparePassword(currentPassword, user.password_hash);
  if (!isMatch) {
    throw new ValidationError('Current password is incorrect');
  }

  // Validate new password
  if (!newPassword || newPassword.length < 8) {
    throw new ValidationError('New password must be at least 8 characters');
  }
  if (newPassword === currentPassword) {
    throw new ValidationError('New password must be different from current password');
  }

  user.password_hash = await hashPassword(newPassword);
  user.must_change_password = false;
  await user.save();
}

async function getActiveSessions(userId) {
  return Session.find({
    user_id: userId,
    revoked: false,
    expires_at: { $gt: new Date() }
  }).select('created_at expires_at');
}

async function revokeAllSessions(userId, exceptToken) {
  await Session.updateMany(
    { user_id: userId, token: { $ne: exceptToken }, revoked: false },
    { revoked: true }
  );
}

module.exports = {
  login,
  logout,
  changePassword,
  getActiveSessions,
  revokeAllSessions
};
