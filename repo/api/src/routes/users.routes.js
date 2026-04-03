const express = require('express');
const router = express.Router();
const userService = require('../services/user.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/rbac.middleware');
const { createUserValidation, mongoIdParam, paginationValidation } = require('../middleware/validation.middleware');

// All user management routes require admin
router.use(authMiddleware);

// GET /api/users
router.get('/', adminOnly, paginationValidation, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query;
    const result = await userService.getUsers({ role, status, search }, page, limit);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', adminOnly, mongoIdParam, async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    res.json({ user });
  } catch (err) { next(err); }
});

// POST /api/users
router.post('/', adminOnly, createUserValidation, async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body);
    res.status(201).json({ user });
  } catch (err) { next(err); }
});

// PUT /api/users/:id
router.put('/:id', adminOnly, mongoIdParam, async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    res.json({ user });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id
router.delete('/:id', adminOnly, mongoIdParam, async (req, res, next) => {
  try {
    await userService.deleteUser(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
