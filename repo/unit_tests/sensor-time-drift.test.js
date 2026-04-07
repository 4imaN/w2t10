const mongoose = require('mongoose');

describe('Sensor Time-Drift — Schema', () => {
  const SensorReading = require('../api/src/models/SensorReading');

  test('model has time_drift in outlier_flags', () => {
    const flags = SensorReading.schema.path('outlier_flags.time_drift');
    expect(flags).toBeDefined();
    expect(flags.instance).toBe('Boolean');
  });

  test('model has time_drift_seconds field', () => {
    const field = SensorReading.schema.path('time_drift_seconds');
    expect(field).toBeDefined();
    expect(field.instance).toBe('Number');
  });
});

describe('Time-Drift Logic (unit)', () => {
  const THRESHOLD = 300;

  function wouldFlag(readingTimestamp, serverNow) {
    const driftSec = Math.abs((new Date(readingTimestamp) - new Date(serverNow)) / 1000);
    return driftSec > THRESHOLD;
  }

  test('reading 1 second old is accepted', () => {
    const now = new Date();
    const reading = new Date(now.getTime() - 1000);
    expect(wouldFlag(reading, now)).toBe(false);
  });

  test('reading 4 minutes old is accepted', () => {
    const now = new Date();
    const reading = new Date(now.getTime() - 240000);
    expect(wouldFlag(reading, now)).toBe(false);
  });

  test('reading exactly 5 minutes old is accepted (boundary)', () => {
    const now = new Date();
    const reading = new Date(now.getTime() - 300000);
    expect(wouldFlag(reading, now)).toBe(false);
  });

  test('reading 6 minutes old is flagged', () => {
    const now = new Date();
    const reading = new Date(now.getTime() - 360000);
    expect(wouldFlag(reading, now)).toBe(true);
  });

  test('reading 1 hour in the future is flagged', () => {
    const now = new Date();
    const reading = new Date(now.getTime() + 3600000);
    expect(wouldFlag(reading, now)).toBe(true);
  });

  test('reading 10 seconds in the future is accepted', () => {
    const now = new Date();
    const reading = new Date(now.getTime() + 10000);
    expect(wouldFlag(reading, now)).toBe(false);
  });
});

describe('Sensor Time-Drift — API Behavior', () => {
  const request = require('supertest');
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';
  let app, adminToken, deviceId, deviceSecret;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-drift';
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.NODE_ENV = 'test';
    process.env.MONGO_URI = MONGO_URI;
    await mongoose.connect(MONGO_URI);
    app = require('../api/src/app');

    const User = require('../api/src/models/User');
    const { hashPassword } = require('../api/src/utils/crypto');
    await User.deleteMany({ username: 'td_admin' });
    await User.create({
      username: 'td_admin', password_hash: await hashPassword('Test1234!'),
      role: 'administrator', display_name: 'TD Admin'
    });
    const loginRes = await request(app).post('/api/auth/login')
      .send({ username: 'td_admin', password: 'Test1234!' });
    adminToken = loginRes.body.token;

    const devRes = await request(app).post('/api/sensors/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ device_id: 'td_drift_dev_' + Date.now(), label: 'Drift Test', unit: 'C' });
    deviceId = devRes.body.device.device_id;
    deviceSecret = devRes.body.device_secret;
  });

  afterAll(async () => {
    const User = require('../api/src/models/User');
    await User.deleteMany({ username: 'td_admin' });
    await mongoose.disconnect();
  });

  test('ingesting a reading with large time drift flags it', async () => {
    const oldTimestamp = new Date(Date.now() - 600000); // 10 min ago
    const res = await request(app).post('/api/sensors/ingest')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Secret', deviceSecret)
      .send({ device_id: deviceId, timestamp: oldTimestamp.toISOString(), value: 25.0 });
    expect(res.status).toBe(201);
    expect(res.body.reading.outlier_flags.time_drift).toBe(true);
    expect(res.body.reading.time_drift_seconds).toBeGreaterThan(300);
  });

  test('ingesting a reading with small time drift does not flag it', async () => {
    const recentTimestamp = new Date(Date.now() - 2000); // 2 sec ago
    const res = await request(app).post('/api/sensors/ingest')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Secret', deviceSecret)
      .send({ device_id: deviceId, timestamp: recentTimestamp.toISOString(), value: 25.5 });
    expect(res.status).toBe(201);
    expect(res.body.reading.outlier_flags.time_drift).toBe(false);
  });
});
