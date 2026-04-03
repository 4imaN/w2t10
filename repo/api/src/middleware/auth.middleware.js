const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const User = require('../models/User');
const { UnauthorizedError } = require('../utils/errors');
const { getJwtSecret } = require('../utils/env');

const JWT_SECRET = getJwtSecret();

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      throw new UnauthorizedError('Invalid or expired token');
    }

    // Check session is still valid
    const session = await Session.findOne({ token, revoked: false });
    if (!session || session.expires_at < new Date()) {
      throw new UnauthorizedError('Session expired or revoked');
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.status !== 'active' || user.deleted_at) {
      throw new UnauthorizedError('User account is inactive or deleted');
    }

    req.user = {
      id: user._id,
      username: user.username,
      role: user.role,
      display_name: user.display_name
    };
    req.token = token;

    const PASSWORD_CHANGE_BYPASS = [
      '/api/auth/change-password',
      '/api/auth/logout',
      '/api/auth/sessions',
      '/api/auth/revoke-sessions',
      '/api/auth/me'
    ];
    const requestPath = req.originalUrl.split('?')[0];
    if (user.must_change_password && !PASSWORD_CHANGE_BYPASS.includes(requestPath)) {
      return res.status(403).json({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your password before accessing other resources'
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authMiddleware, JWT_SECRET };
