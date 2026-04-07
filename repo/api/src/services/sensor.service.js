const SensorReading = require('../models/SensorReading');
const SensorDevice = require('../models/SensorDevice');
const BatchSession = require('../models/BatchSession');
const { getConfig } = require('./config.service');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

async function ingestReading(data) {
  const device = await SensorDevice.findOne({ device_id: data.device_id, deleted_at: null });
  if (!device) throw new NotFoundError(`Sensor device '${data.device_id}'`);

  const timestamp = new Date(data.timestamp);

  const exists = await SensorReading.findOne({ device_id: data.device_id, timestamp, is_raw: true });
  if (exists) {
    throw new ConflictError(`Reading already exists for device ${data.device_id} at ${timestamp.toISOString()}`);
  }

  const driftThreshold = await getConfig('time_drift_threshold_seconds', 300);
  const serverNow = new Date();
  const timeDriftSeconds = Math.abs((timestamp - serverNow) / 1000);
  const hasTimeDrift = timeDriftSeconds > driftThreshold;

  const outlierFlags = { range: false, spike: false, drift: false, time_drift: hasTimeDrift };

  if (device.range_min !== null && data.value < device.range_min) outlierFlags.range = true;
  if (device.range_max !== null && data.value > device.range_max) outlierFlags.range = true;

  if (device.spike_threshold !== null) {
    const prev = await SensorReading.findOne({ device_id: data.device_id, is_raw: true })
      .sort({ timestamp: -1 }).limit(1);
    if (prev && Math.abs(data.value - prev.value) > device.spike_threshold) {
      outlierFlags.spike = true;
    }
  }

  if (device.drift_threshold !== null) {
    const window = device.drift_window || 10;
    const recentReadings = await SensorReading.find({ device_id: data.device_id, is_raw: true })
      .sort({ timestamp: -1 }).limit(window);
    if (recentReadings.length >= window) {
      const oldest = recentReadings[recentReadings.length - 1].value;
      if (Math.abs(data.value - oldest) > device.drift_threshold) {
        outlierFlags.drift = true;
      }
    }
  }

  const hasOutlier = outlierFlags.range || outlierFlags.spike || outlierFlags.drift || outlierFlags.time_drift;
  const retentionDays = await getConfig('sensor_retention_days', 180);
  const expiresAt = new Date(Date.now() + retentionDays * 86400000);

  const rawReading = await SensorReading.create({
    device_id: data.device_id,
    timestamp,
    value: data.value,
    unit: data.unit || device.unit || '',
    is_raw: true,
    is_cleaned: false,
    outlier_flags: outlierFlags,
    time_drift_seconds: timeDriftSeconds,
    expires_at: expiresAt
  });

  // Cleaned-value policy:
  // - Non-outlier readings: cleaned value = raw value (pass-through).
  // - Outlier readings: cleaned value = null (excluded from analytics;
  //   presence in cleaned set preserves the timestamp slot for gap detection).
  await SensorReading.create({
    device_id: data.device_id,
    timestamp,
    value: hasOutlier ? null : data.value,
    unit: data.unit || device.unit || '',
    is_raw: false,
    is_cleaned: true,
    outlier_flags: hasOutlier ? outlierFlags : { range: false, spike: false, drift: false, time_drift: false },
    time_drift_seconds: timeDriftSeconds,
    expires_at: expiresAt
  });

  return rawReading;
}

async function ingestBatch(readings, sessionId = null, deviceId = null) {
  const results = { ingested: 0, duplicates: 0, errors: [], session_id: null, resume_offset: 0 };
  const crypto = require('crypto');
  const SESSION_TTL_MS = 3600000;

  let startOffset = 0;
  if (sessionId) {
    const session = await BatchSession.findOne({ session_id: sessionId });
    if (session) {
      startOffset = session.processed;
      results.resume_offset = startOffset;
    }
    results.session_id = sessionId;
  } else {
    results.session_id = `batch_${crypto.randomBytes(8).toString('hex')}`;
  }

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  for (let i = startOffset; i < readings.length; i++) {
    const r = readings[i];
    try {
      await ingestReading(r);
      results.ingested++;
    } catch (err) {
      if (err instanceof ConflictError) {
        results.duplicates++;
      } else {
        results.errors.push({ index: i, device_id: r.device_id, timestamp: r.timestamp, error: err.message });
      }
    }

    if (results.session_id) {
      await BatchSession.findOneAndUpdate(
        { session_id: results.session_id },
        { session_id: results.session_id, device_id: deviceId || r.device_id, processed: i + 1, expires_at: expiresAt },
        { upsert: true }
      );
    }
  }

  return results;
}

async function getReadings(deviceId, filters = {}, page = 1, limit = 100) {
  const query = { device_id: deviceId };
  if (filters.from) query.timestamp = { ...query.timestamp, $gte: new Date(filters.from) };
  if (filters.to) query.timestamp = { ...query.timestamp, $lte: new Date(filters.to) };
  if (filters.cleaned_only) {
    query.is_cleaned = true;
    query.is_raw = false;
  } else if (filters.raw_only) {
    query.is_raw = true;
  }
  if (filters.outliers_only) {
    query.is_raw = true;
    query.$or = [
      { 'outlier_flags.range': true },
      { 'outlier_flags.spike': true },
      { 'outlier_flags.drift': true }
    ];
  }

  const total = await SensorReading.countDocuments(query);
  const readings = await SensorReading.find(query)
    .sort({ timestamp: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return { readings, total, page, pages: Math.ceil(total / limit) };
}

async function createDevice(data) {
  return SensorDevice.create(data);
}

const DEVICE_SAFE_PROJECTION = '-secret_hash';

function stripSecretHash(device) {
  const obj = device.toObject ? device.toObject() : { ...device };
  delete obj.secret_hash;
  return obj;
}

async function getDevices() {
  return SensorDevice.find({ deleted_at: null }).select(DEVICE_SAFE_PROJECTION).sort({ device_id: 1 });
}

async function getDeviceById(id) {
  const device = await SensorDevice.findOne({ _id: id, deleted_at: null }).select(DEVICE_SAFE_PROJECTION);
  if (!device) throw new NotFoundError('Sensor device');
  return device;
}

async function updateDevice(id, updates) {
  const device = await SensorDevice.findOne({ _id: id, deleted_at: null });
  if (!device) throw new NotFoundError('Sensor device');

  const fields = ['label', 'unit', 'range_min', 'range_max', 'spike_threshold', 'drift_threshold', 'drift_window', 'sampling_rate_hz', 'status', 'secret_hash'];
  for (const f of fields) {
    if (updates[f] !== undefined) device[f] = updates[f];
  }
  await device.save();
  return stripSecretHash(device);
}

async function cleanupExpiredReadings() {
  const result = await SensorReading.deleteMany({ expires_at: { $lte: new Date() } });
  return result.deletedCount;
}

module.exports = {
  ingestReading,
  ingestBatch,
  getReadings,
  createDevice,
  getDevices,
  getDeviceById,
  updateDevice,
  cleanupExpiredReadings
};
