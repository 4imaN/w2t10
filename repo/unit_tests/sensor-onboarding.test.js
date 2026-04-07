const request = require('supertest');
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app, adminToken;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-onboard';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;
  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const { hashPassword } = require('../api/src/utils/crypto');
  await User.deleteMany({ username: 'so_admin' });
  await User.create({
    username: 'so_admin', password_hash: await hashPassword('Test1234!'),
    role: 'administrator', display_name: 'SO Admin'
  });
  const res = await request(app).post('/api/auth/login')
    .send({ username: 'so_admin', password: 'Test1234!' });
  adminToken = res.body.token;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  await User.deleteMany({ username: 'so_admin' });
  await mongoose.disconnect();
});

describe('Sensor Onboarding — Device Registration', () => {
  let deviceId, deviceMongoId, deviceSecret;

  test('device creation returns one-time plaintext secret (201)', async () => {
    const did = 'so_dev_' + Date.now();
    const res = await request(app).post('/api/sensors/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ device_id: did, label: 'Test Sensor', unit: 'C' });
    expect(res.status).toBe(201);
    expect(res.body.device_secret).toBeDefined();
    expect(res.body.device_secret.length).toBeGreaterThan(16);
    expect(res.body.device.device_id).toBe(did);
    expect(res.body.device.secret_hash).toBeUndefined();

    deviceId = did;
    deviceMongoId = res.body.device._id;
    deviceSecret = res.body.device_secret;
  });

  test('device can authenticate with returned secret', async () => {
    const res = await request(app).post('/api/sensors/ingest')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Secret', deviceSecret)
      .send({ device_id: deviceId, timestamp: new Date().toISOString(), value: 22.5 });
    expect(res.status).toBe(201);
  });

  test('device cannot authenticate with wrong secret (401)', async () => {
    const res = await request(app).post('/api/sensors/ingest')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Secret', 'wrong-secret-value')
      .send({ device_id: deviceId, timestamp: new Date().toISOString(), value: 22.5 });
    expect(res.status).toBe(401);
  });

  test('secret rotation returns new secret and invalidates old (200)', async () => {
    const rotRes = await request(app)
      .post(`/api/sensors/devices/${deviceMongoId}/rotate-secret`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(rotRes.status).toBe(200);
    expect(rotRes.body.device_secret).toBeDefined();
    const newSecret = rotRes.body.device_secret;

    const oldRes = await request(app).post('/api/sensors/ingest')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Secret', deviceSecret)
      .send({ device_id: deviceId, timestamp: new Date().toISOString(), value: 23 });
    expect(oldRes.status).toBe(401);

    const newRes = await request(app).post('/api/sensors/ingest')
      .set('X-Device-Id', deviceId)
      .set('X-Device-Secret', newSecret)
      .send({ device_id: deviceId, timestamp: new Date().toISOString(), value: 23 });
    expect(newRes.status).toBe(201);
  });

  test('only admin can register devices (403 for non-admin)', async () => {
    const User = require('../api/src/models/User');
    const { hashPassword } = require('../api/src/utils/crypto');
    await User.deleteMany({ username: 'so_dispatcher' });
    await User.create({
      username: 'so_dispatcher', password_hash: await hashPassword('Test1234!'),
      role: 'dispatcher', display_name: 'Disp'
    });
    const loginRes = await request(app).post('/api/auth/login')
      .send({ username: 'so_dispatcher', password: 'Test1234!' });

    const res = await request(app).post('/api/sensors/devices')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({ device_id: 'so_forbidden', label: 'Nope', unit: 'F' });
    expect(res.status).toBe(403);

    await User.deleteMany({ username: 'so_dispatcher' });
  });
});
