const express = require('express');
const router = express.Router();
const disputeService = require('../services/dispute.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { allRoles } = require('../middleware/rbac.middleware');
const { createDisputeValidation } = require('../middleware/validation.middleware');

router.use(authMiddleware, allRoles);

// POST /api/disputes — initiate a dispute (any role)
router.post('/', createDisputeValidation, async (req, res, next) => {
  try {
    const dispute = await disputeService.createDispute(req.body, req.user.id, req.user.role);
    res.status(201).json({ dispute });
  } catch (err) { next(err); }
});

module.exports = router;
