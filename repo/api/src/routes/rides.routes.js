const express = require('express');
const router = express.Router();
const rideService = require('../services/ride.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { allRoles } = require('../middleware/rbac.middleware');
const { createRideValidation, mongoIdParam, paginationValidation } = require('../middleware/validation.middleware');
const { ForbiddenError } = require('../utils/errors');

router.use(authMiddleware, allRoles);

const PRIVILEGED_ROLES = ['administrator', 'dispatcher'];

// Ownership check: regular users can only access their own rides
async function enforceRideOwnership(req, ride) {
  if (PRIVILEGED_ROLES.includes(req.user.role)) return;
  const requesterId = ride.requester?._id?.toString() || ride.requester?.toString();
  if (requesterId !== req.user.id.toString()) {
    throw new ForbiddenError('You can only access your own ride requests');
  }
}

// GET /api/rides — list ride requests
router.get('/', paginationValidation, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filters = { status };
    // Non-privileged users see only their own rides
    if (!PRIVILEGED_ROLES.includes(req.user.role)) {
      filters.requester = req.user.id;
    }
    const result = await rideService.getRideRequests(filters, parseInt(page), parseInt(limit));
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/rides/:id
router.get('/:id', mongoIdParam, async (req, res, next) => {
  try {
    const ride = await rideService.getRideById(req.params.id);
    await enforceRideOwnership(req, ride);
    res.json({ ride });
  } catch (err) { next(err); }
});

// POST /api/rides
router.post('/', createRideValidation, async (req, res, next) => {
  try {
    const ride = await rideService.createRideRequest(req.body, req.user.id);
    res.status(201).json({ ride });
  } catch (err) { next(err); }
});

// POST /api/rides/:id/cancel
router.post('/:id/cancel', mongoIdParam, async (req, res, next) => {
  try {
    const ride = await rideService.getRideById(req.params.id);
    await enforceRideOwnership(req, ride);
    const result = await rideService.cancelRide(req.params.id, req.user.id, req.user.role);
    if (result.requiresApproval) {
      return res.status(200).json(result);
    }
    res.json({ ride: result });
  } catch (err) { next(err); }
});

// POST /api/rides/:id/feedback
router.post('/:id/feedback', mongoIdParam, async (req, res, next) => {
  try {
    const { rating, comment } = req.body;
    const ride = await rideService.submitFeedback(req.params.id, req.user.id, rating, comment);
    res.json({ ride });
  } catch (err) { next(err); }
});

module.exports = router;
