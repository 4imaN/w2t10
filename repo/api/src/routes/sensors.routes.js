const express = require('express');
const router = express.Router();
const sensorService = require('../services/sensor.service');
const { authMiddleware } = require('../middleware/auth.middleware');
const { requireRole, adminOnly } = require('../middleware/rbac.middleware');
const { sensorIngestValidation, mongoIdParam, paginationValidation } = require('../middleware/validation.middleware');

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

function enforceDeviceIdentity(req, res, next) {
  const headerDeviceId = req.headers['x-device-id'];
  const bodyDeviceId = req.body?.device_id;
  if (bodyDeviceId && bodyDeviceId !== headerDeviceId) {
    return res.status(403).json({
      code: 'FORBIDDEN',
      message: `Body device_id '${bodyDeviceId}' does not match authenticated device '${headerDeviceId}'`
    });
  }
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

router.post('/ingest', deviceAuth, enforceDeviceIdentity, sensorIngestValidation, async (req, res, next) => {
  try {
    const reading = await sensorService.ingestReading(req.body);
    res.status(201).json({ reading });
  } catch (err) { next(err); }
});

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

router.use(authMiddleware);

router.get('/devices', requireRole('administrator', 'dispatcher'), async (req, res, next) => {
  try {
    const devices = await sensorService.getDevices();
    res.json({ devices });
  } catch (err) { next(err); }
});

router.get('/devices/:id', requireRole('administrator', 'dispatcher'), mongoIdParam, async (req, res, next) => {
  try {
    const device = await sensorService.getDeviceById(req.params.id);
    res.json({ device });
  } catch (err) { next(err); }
});

router.post('/devices', adminOnly, async (req, res, next) => {
  try {
    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const secretHash = await bcrypt.hash(rawSecret, 10);
    const device = await sensorService.createDevice({ ...req.body, secret_hash: secretHash });
    const deviceObj = device.toObject();
    delete deviceObj.secret_hash;
    res.status(201).json({ device: deviceObj, device_secret: rawSecret });
  } catch (err) { next(err); }
});

router.post('/devices/:id/rotate-secret', adminOnly, mongoIdParam, async (req, res, next) => {
  try {
    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const secretHash = await bcrypt.hash(rawSecret, 10);
    const device = await sensorService.updateDevice(req.params.id, { secret_hash: secretHash });
    const deviceObj = device.toObject ? device.toObject() : { ...device };
    delete deviceObj.secret_hash;
    res.json({ device: deviceObj, device_secret: rawSecret });
  } catch (err) { next(err); }
});

router.put('/devices/:id', adminOnly, mongoIdParam, async (req, res, next) => {
  try {
    const device = await sensorService.updateDevice(req.params.id, req.body);
    res.json({ device });
  } catch (err) { next(err); }
});

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
