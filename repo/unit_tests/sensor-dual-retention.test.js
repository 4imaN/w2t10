const mongoose = require('mongoose');

describe('Sensor Dual Retention — Schema', () => {
  const SensorReading = require('../api/src/models/SensorReading');

  test('unique index includes is_raw to allow raw+cleaned coexistence', () => {
    const indexes = SensorReading.schema.indexes();
    const uniqueIdx = indexes.find(([fields, opts]) =>
      fields.device_id === 1 && fields.timestamp === 1 && fields.is_raw === 1 && opts.unique
    );
    expect(uniqueIdx).toBeDefined();
  });

  test('schema has is_raw and is_cleaned boolean fields', () => {
    expect(SensorReading.schema.path('is_raw').instance).toBe('Boolean');
    expect(SensorReading.schema.path('is_cleaned').instance).toBe('Boolean');
  });

  test('schema has outlier_flags subfields', () => {
    expect(SensorReading.schema.path('outlier_flags.range')).toBeDefined();
    expect(SensorReading.schema.path('outlier_flags.spike')).toBeDefined();
    expect(SensorReading.schema.path('outlier_flags.drift')).toBeDefined();
    expect(SensorReading.schema.path('outlier_flags.time_drift')).toBeDefined();
  });
});

describe('Sensor Dual Retention — API Behavior', () => {
  const request = require('supertest');
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';
  let app, adminToken, deviceId, deviceSecret;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-dual';
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.NODE_ENV = 'test';
    process.env.MONGO_URI = MONGO_URI;
    await mongoose.connect(MONGO_URI);
    app = require('../api/src/app');

    const User = require('../api/src/models/User');
    const { hashPassword } = require('../api/src/utils/crypto');
    await User.deleteMany({ username: 'dr_admin' });
    await User.create({
      username: 'dr_admin', password_hash: await hashPassword('Test1234!'),
      role: 'administrator', display_name: 'DR Admin'
    });
    const loginRes = await request(app).post('/api/auth/login')
      .send({ username: 'dr_admin', password: 'Test1234!' });
    adminToken = loginRes.body.token;

    const devRes = await request(app).post('/api/sensors/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ device_id: 'dr_dev_' + Date.now(), label: 'Dual Ret', unit: 'C' });
    deviceId = devRes.body.device.device_id;
    deviceSecret = devRes.body.device_secret;
  });

  afterAll(async () => {
    const User = require('../api/src/models/User');
    await User.deleteMany({ username: 'dr_admin' });
    await mongoose.disconnect();
  });

  test('normal reading creates raw with value and cleaned with same value', async () => {
    const SensorReading = require('../api/src/models/SensorReading');
    const ts = new Date();

    const res = await request(app).post('/api/sensors/ingest')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Secret', deviceSecret)
      .send({ device_id: deviceId, timestamp: ts.toISOString(), value: 22.0 });
    expect(res.status).toBe(201);

    const readings = await SensorReading.find({ device_id: deviceId, timestamp: ts });
    const raw = readings.find(r => r.is_raw === true);
    const cleaned = readings.find(r => r.is_cleaned === true);

    expect(raw).toBeDefined();
    expect(raw.value).toBe(22.0);
    expect(cleaned).toBeDefined();
    expect(cleaned.is_raw).toBe(false);
    expect(cleaned.is_cleaned).toBe(true);
    expect(cleaned.value).toBe(22.0);
  });

  test('drifted reading creates raw with value AND cleaned with null value', async () => {
    const SensorReading = require('../api/src/models/SensorReading');
    const oldTs = new Date(Date.now() - 600000);

    const res = await request(app).post('/api/sensors/ingest')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Secret', deviceSecret)
      .send({ device_id: deviceId, timestamp: oldTs.toISOString(), value: 99.0 });
    expect(res.status).toBe(201);

    const readings = await SensorReading.find({ device_id: deviceId, timestamp: oldTs });
    const raw = readings.find(r => r.is_raw === true);
    const cleaned = readings.find(r => r.is_cleaned === true);

    expect(raw).toBeDefined();
    expect(raw.value).toBe(99.0);
    expect(raw.outlier_flags.time_drift).toBe(true);

    expect(cleaned).toBeDefined();
    expect(cleaned.is_cleaned).toBe(true);
    expect(cleaned.value).toBeNull();
  });
});
