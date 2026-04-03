const express = require('express');
const router = express.Router();
const ledgerService = require('../services/ledger.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { dispatcherOrAdmin } = require('../middleware/rbac.middleware');
const { ledgerEntryValidation, paginationValidation } = require('../middleware/validation.middleware');

router.use(authMiddleware, dispatcherOrAdmin);

// POST /api/ledger/entries
router.post('/entries', ledgerEntryValidation, async (req, res, next) => {
  try {
    const result = await ledgerService.recordPayment(req.body, req.user.id);
    if (result.duplicate) {
      return res.status(200).json({ entry: result.entry, message: 'Duplicate entry — returning existing record' });
    }
    res.status(201).json({ entry: result.entry });
  } catch (err) { next(err); }
});

// GET /api/ledger/entries
router.get('/entries', paginationValidation, async (req, res, next) => {
  try {
    const { page = 1, limit = 50, ledger_date, status, payment_method, ride_request } = req.query;
    const result = await ledgerService.getLedgerEntries(
      { ledger_date, status, payment_method, ride_request },
      parseInt(page), parseInt(limit)
    );
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/ledger/reconciliation/:date
router.get('/reconciliation/:date', async (req, res, next) => {
  try {
    const recon = await ledgerService.getReconciliation(req.params.date);
    res.json({ reconciliation: recon });
  } catch (err) { next(err); }
});

// POST /api/ledger/reconciliation/:date/close
router.post('/reconciliation/:date/close', async (req, res, next) => {
  try {
    const recon = await ledgerService.closeDayReconciliation(req.params.date, req.user.id);
    res.json({ reconciliation: recon });
  } catch (err) { next(err); }
});

module.exports = router;
