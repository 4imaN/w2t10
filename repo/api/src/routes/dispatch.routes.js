const express = require('express');
const router = express.Router();
const rideService = require('../services/ride.service');
const disputeService = require('../services/dispute.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { dispatcherOrAdmin } = require('../middleware/rbac.middleware');
const { mongoIdParam, paginationValidation, createDisputeValidation } = require('../middleware/validation.middleware');

router.use(authMiddleware, dispatcherOrAdmin);


router.get('/queue', paginationValidation, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await rideService.getRideRequests({ status: 'pending_match' }, parseInt(page), parseInt(limit));
    res.json(result);
  } catch (err) { next(err); }
});


router.post('/rides/:id/accept', mongoIdParam, async (req, res, next) => {
  try {
    const ride = await rideService.acceptRide(req.params.id, req.user.id, req.body.notes);
    res.json({ ride });
  } catch (err) { next(err); }
});


router.post('/rides/:id/transition', mongoIdParam, async (req, res, next) => {
  try {
    const { to_status, reason } = req.body;
    const ride = await rideService.transitionRide(req.params.id, to_status, req.user.id, reason);
    res.json({ ride });
  } catch (err) { next(err); }
});


router.post('/rides/:id/approve-cancel', mongoIdParam, async (req, res, next) => {
  try {
    const ride = await rideService.approveCancellation(req.params.id, req.user.id);
    res.json({ ride });
  } catch (err) { next(err); }
});


router.get('/disputes', paginationValidation, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const result = await disputeService.getDisputes({ status }, parseInt(page), parseInt(limit));
    res.json(result);
  } catch (err) { next(err); }
});


router.get('/disputes/:id', mongoIdParam, async (req, res, next) => {
  try {
    const dispute = await disputeService.getDisputeById(req.params.id);
    res.json({ dispute });
  } catch (err) { next(err); }
});


router.post('/disputes/:id/assign', mongoIdParam, async (req, res, next) => {
  try {
    const dispute = await disputeService.assignDispute(req.params.id, req.user.id, req.user.role);
    res.json({ dispute });
  } catch (err) { next(err); }
});


router.post('/disputes/:id/resolve', mongoIdParam, async (req, res, next) => {
  try {
    const { resolution, notes } = req.body;
    const dispute = await disputeService.resolveDispute(req.params.id, req.user.id, resolution, notes, req.user.role);
    res.json({ dispute });
  } catch (err) { next(err); }
});

router.get('/carpool/candidates/:id', mongoIdParam, async (req, res, next) => {
  try {
    const candidates = await rideService.getCarpoolCandidates(req.params.id);
    res.json({ candidates });
  } catch (err) { next(err); }
});

router.post('/carpool/group', async (req, res, next) => {
  try {
    const result = await rideService.groupCarpoolRides(req.body.ride_ids, req.user.id);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

router.get('/carpool/group/:groupId', async (req, res, next) => {
  try {
    const rides = await rideService.getCarpoolGroup(req.params.groupId);
    res.json({ rides });
  } catch (err) { next(err); }
});

module.exports = router;
