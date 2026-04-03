const express = require('express');
const router = express.Router();
const sensorService = require('../services/sensor.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { requireRole, adminOnly } = require('../middleware/rbac.middleware');
const { sensorIngestValidation, mongoIdParam, paginationValidation } = require('../middleware/validation.middleware');

// Per-device secret authentication for sensor ingest endpoints.
// Requires headers:
//   X-Device-Id: the device_id
//   X-Device-Secret: a per-device secret set when the device is registered
// The body device_id must match the header device_id (prevents cross-device spoofing).
async function deviceAuth(req, res, next) {
  const deviceId = req.headers['x-device-id'];
  const deviceSecret = req.headers['x-device-secret'];
  if (!deviceId || !deviceSecret) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'X-Device-Id and X-Device-Secret headers required' });
  }
  const SensorDevice = require('../models/SensorDevice');
  const bcrypt = require('bcryptjs');
  const device = await SensorDevice.findOne({ device_id: deviceId, status: 'active', deleted_at: null });
  if (!device || !device.secret_hash) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Unknown or inactive device, or no secret configured' });
  }
  const valid = await bcrypt.compare(deviceSecret, device.secret_hash);
  if (!valid) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid device secret' });
  }
  req.sensorDevice = device;
  next();
}

// Body-header identity enforcement: body device_id must match authenticated header
function enforceDeviceIdentity(req, res, next) {
  const headerDeviceId = req.headers['x-device-id'];
  const bodyDeviceId = req.body?.device_id;
  // For single ingest, enforce exact match
  if (bodyDeviceId && bodyDeviceId !== headerDeviceId) {
    return res.status(403).json({
      code: 'FORBIDDEN',
      message: `Body device_id '${bodyDeviceId}' does not match authenticated device '${headerDeviceId}'`
    });
  }
  // For batch, enforce all readings match
  if (req.body?.readings && Array.isArray(req.body.readings)) {
    const mismatch = req.body.readings.find(r => r.device_id && r.device_id !== headerDeviceId);
    if (mismatch) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: `Batch contains reading for device '${mismatch.device_id}' but authenticated as '${headerDeviceId}'`
      });
    }
  }
  next();
}

// POST /api/sensors/ingest — requires per-device secret + identity match
router.post('/ingest', deviceAuth, enforceDeviceIdentity, sensorIngestValidation, async (req, res, next) => {
  try {
    const reading = await sensorService.ingestReading(req.body);
    res.status(201).json({ reading });
  } catch (err) { next(err); }
});

// POST /api/sensors/ingest/batch — requires per-device secret + identity match
router.post('/ingest/batch', deviceAuth, enforceDeviceIdentity, async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.readings)) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'readings must be an array' });
    }
    const sessionId = req.headers['x-batch-session'] || null;
    const results = await sensorService.ingestBatch(req.body.readings, sessionId, req.headers['x-device-id']);
    res.status(201).json(results);
  } catch (err) { next(err); }
});

// Protected routes below
router.use(authMiddleware);

// GET /api/sensors/devices
router.get('/devices', requireRole('administrator', 'dispatcher'), async (req, res, next) => {
  try {
    const devices = await sensorService.getDevices();
    res.json({ devices });
  } catch (err) { next(err); }
});

// GET /api/sensors/devices/:id
router.get('/devices/:id', requireRole('administrator', 'dispatcher'), mongoIdParam, async (req, res, next) => {
  try {
    const device = await sensorService.getDeviceById(req.params.id);
    res.json({ device });
  } catch (err) { next(err); }
});

// POST /api/sensors/devices — creates device and returns a one-time plaintext secret
router.post('/devices', adminOnly, async (req, res, next) => {
  try {
    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const secretHash = await bcrypt.hash(rawSecret, 10);
    const device = await sensorService.createDevice({ ...req.body, secret_hash: secretHash });
    // Return plaintext secret only once — it's not stored
    res.status(201).json({ device, device_secret: rawSecret });
  } catch (err) { next(err); }
});

// POST /api/sensors/devices/:id/rotate-secret — generate new device secret
router.post('/devices/:id/rotate-secret', adminOnly, mongoIdParam, async (req, res, next) => {
  try {
    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const secretHash = await bcrypt.hash(rawSecret, 10);
    const device = await sensorService.updateDevice(req.params.id, { secret_hash: secretHash });
    res.json({ device, device_secret: rawSecret });
  } catch (err) { next(err); }
});

// PUT /api/sensors/devices/:id
router.put('/devices/:id', adminOnly, mongoIdParam, async (req, res, next) => {
  try {
    const device = await sensorService.updateDevice(req.params.id, req.body);
    res.json({ device });
  } catch (err) { next(err); }
});

// GET /api/sensors/readings/:deviceId
router.get('/readings/:deviceId', requireRole('administrator', 'dispatcher'), async (req, res, next) => {
  try {
    const { from, to, cleaned_only, raw_only, outliers_only, page = 1, limit = 100 } = req.query;
    const result = await sensorService.getReadings(
      req.params.deviceId,
      { from, to, cleaned_only: cleaned_only === 'true', raw_only: raw_only === 'true', outliers_only: outliers_only === 'true' },
      parseInt(page), parseInt(limit)
    );
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
