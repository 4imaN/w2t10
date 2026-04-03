const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { loginValidation } = require('../middleware/validation.middleware');

// POST /api/auth/login
router.post('/login', loginValidation, async (req, res, next) => {
  try {
    const result = await authService.login(req.body.username, req.body.password, req.body.portal);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    await authService.logout(req.token);
    res.json({ message: 'Logged out successfully' });
  } catch (err) { next(err); }
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'current_password and new_password are required' });
    }
    await authService.changePassword(req.user.id, current_password, new_password);
    res.json({ message: 'Password changed successfully' });
  } catch (err) { next(err); }
});

// GET /api/auth/sessions
router.get('/sessions', authMiddleware, async (req, res, next) => {
  try {
    const sessions = await authService.getActiveSessions(req.user.id);
    res.json({ sessions });
  } catch (err) { next(err); }
});

// POST /api/auth/revoke-sessions
router.post('/revoke-sessions', authMiddleware, async (req, res, next) => {
  try {
    await authService.revokeAllSessions(req.user.id, req.token);
    res.json({ message: 'All other sessions revoked' });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
