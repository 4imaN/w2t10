const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const app = require('../api/src/app');
const User = require('../api/src/models/User');
const SensorDevice = require('../api/src/models/SensorDevice');
const SensorReading = require('../api/src/models/SensorReading');
const ConfigDictionary = require('../api/src/models/ConfigDictionary');
const { hashPassword } = require('../api/src/utils/crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let adminToken;
const DEVICE_ID = 'TEMP-TEST-001';
const DEVICE_SECRET = 'test-device-secret-abc123';

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  await User.deleteMany({});
  await SensorDevice.deleteMany({});
  await SensorReading.deleteMany({});

  await ConfigDictionary.findOneAndUpdate(
    { key: 'sensor_retention_days' },
    { key: 'sensor_retention_days', value: 180, category: 'thresholds' },
    { upsert: true }
  );
  await ConfigDictionary.findOneAndUpdate(
    { key: 'time_drift_threshold_seconds' },
    { key: 'time_drift_threshold_seconds', value: 300, category: 'thresholds' },
    { upsert: true }
  );

  await User.create({
    username: 'sensadmin', password_hash: await hashPassword('Admin123!'),
    role: 'administrator', display_name: 'Admin'
  });

  const res = await request(app).post('/api/auth/login').send({ username: 'sensadmin', password: 'Admin123!' });
  adminToken = res.body.token;

  // Create device with known secret
  const secretHash = await bcrypt.hash(DEVICE_SECRET, 10);
  await SensorDevice.create({
    device_id: DEVICE_ID,
    secret_hash: secretHash,
    label: 'Test Temp Sensor',
    unit: '°C',
    range_min: -10,
    range_max: 50,
    spike_threshold: 10,
    drift_threshold: 15,
    sampling_rate_hz: 1
  });
});

afterAll(async () => {
  await User.deleteMany({});
  await SensorDevice.deleteMany({});
  await SensorReading.deleteMany({});
  await mongoose.disconnect();
});

function deviceHeaders() {
  return { 'X-Device-Id': DEVICE_ID, 'X-Device-Secret': DEVICE_SECRET };
}

describe('Sensor Auth', () => {
  test('rejects ingest without auth headers', async () => {
    const res = await request(app).post('/api/sensors/ingest')
      .send({ device_id: DEVICE_ID, timestamp: new Date().toISOString(), value: 20 });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('rejects ingest with wrong secret', async () => {
    const res = await request(app).post('/api/sensors/ingest')
      .set('X-Device-Id', DEVICE_ID)
      .set('X-Device-Secret', 'wrong-secret')
      .send({ device_id: DEVICE_ID, timestamp: new Date().toISOString(), value: 20 });
    expect(res.status).toBe(401);
  });

  test('rejects ingest with unknown device_id', async () => {
    const res = await request(app).post('/api/sensors/ingest')
      .set('X-Device-Id', 'NONEXISTENT')
      .set('X-Device-Secret', DEVICE_SECRET)
      .send({ device_id: 'NONEXISTENT', timestamp: new Date().toISOString(), value: 20 });
    expect(res.status).toBe(401);
  });

  test('rejects body device_id mismatch (cross-device spoofing)', async () => {
    const res = await request(app).post('/api/sensors/ingest')
      .set(deviceHeaders())
      .send({ device_id: 'SPOOFED-DEVICE', timestamp: new Date().toISOString(), value: 20 });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('does not match');
  });

  test('rejects batch with mixed device_ids', async () => {
    const res = await request(app).post('/api/sensors/ingest/batch')
      .set(deviceHeaders())
      .send({ readings: [
        { device_id: DEVICE_ID, timestamp: new Date(Date.now() + 90000).toISOString(), value: 20 },
        { device_id: 'OTHER-DEVICE', timestamp: new Date(Date.now() + 91000).toISOString(), value: 21 },
      ] });
    expect(res.status).toBe(403);
  });
});

describe('Sensor Ingest (authenticated)', () => {
  test('accepts reading with valid auth', async () => {
    const res = await request(app).post('/api/sensors/ingest')
      .set(deviceHeaders())
      .send({ device_id: DEVICE_ID, timestamp: new Date().toISOString(), value: 22.5 });
    expect(res.status).toBe(201);
    expect(res.body.reading.outlier_flags.range).toBe(false);
  });

  test('detects range outlier', async () => {
    const res = await request(app).post('/api/sensors/ingest')
      .set(deviceHeaders())
      .send({ device_id: DEVICE_ID, timestamp: new Date(Date.now() + 1000).toISOString(), value: 55 });
    expect(res.status).toBe(201);
    expect(res.body.reading.outlier_flags.range).toBe(true);
  });

  test('detects spike', async () => {
    const res = await request(app).post('/api/sensors/ingest')
      .set(deviceHeaders())
      .send({ device_id: DEVICE_ID, timestamp: new Date(Date.now() + 2000).toISOString(), value: 5 });
    expect(res.status).toBe(201);
    expect(res.body.reading.outlier_flags.spike).toBe(true);
  });

  test('deduplicates by device+timestamp', async () => {
    const ts = new Date(Date.now() + 5000).toISOString();
    await request(app).post('/api/sensors/ingest').set(deviceHeaders())
      .send({ device_id: DEVICE_ID, timestamp: ts, value: 20 });
    const res = await request(app).post('/api/sensors/ingest').set(deviceHeaders())
      .send({ device_id: DEVICE_ID, timestamp: ts, value: 21 });
    expect(res.status).toBe(409);
  });

  test('batch ingest works with valid auth', async () => {
    const readings = [
      { device_id: DEVICE_ID, timestamp: new Date(Date.now() + 10000).toISOString(), value: 23 },
      { device_id: DEVICE_ID, timestamp: new Date(Date.now() + 11000).toISOString(), value: 24 }
    ];
    const res = await request(app).post('/api/sensors/ingest/batch')
      .set(deviceHeaders())
      .send({ readings });
    expect(res.status).toBe(201);
    expect(res.body.ingested).toBe(2);
  });
});

describe('Sensor Admin Endpoints', () => {
  test('list devices', async () => {
    const res = await request(app).get('/api/sensors/devices')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.devices.length).toBeGreaterThan(0);
  });

  test('create device returns one-time secret', async () => {
    const res = await request(app).post('/api/sensors/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ device_id: 'NEW-DEVICE-001', label: 'New Sensor', unit: '°C' });
    expect(res.status).toBe(201);
    expect(res.body.device_secret).toBeTruthy();
    expect(res.body.device_secret.length).toBe(64);
    // The hash should be stored, not the raw secret
    expect(res.body.device.secret_hash).toBeUndefined(); // select excludes it... or not
  });

  test('get readings', async () => {
    const res = await request(app).get(`/api/sensors/readings/${DEVICE_ID}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.readings.length).toBeGreaterThan(0);
  });
});
