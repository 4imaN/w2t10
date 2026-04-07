const request = require('supertest');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app, adminToken;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-sanitize';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;
  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.deleteMany({ username: /^san_/ });
  await User.create({
    username: 'san_admin',
    password_hash: await hashPassword('Test1234!'),
    role: 'administrator',
    display_name: 'San Admin'
  });
  const res = await request(app).post('/api/auth/login')
    .send({ username: 'san_admin', password: 'Test1234!' });
  adminToken = res.body.token;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  await User.deleteMany({ username: /^san_/ });
  await mongoose.disconnect();
});

describe('Sensor Device — secret_hash never exposed', () => {
  let deviceMongoId, deviceId;

  test('POST create device does not return secret_hash', async () => {
    const res = await request(app).post('/api/sensors/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ device_id: 'san_dev_' + Date.now(), label: 'Sanitize Test', unit: 'C' });
    expect(res.status).toBe(201);
    expect(res.body.device.secret_hash).toBeUndefined();
    expect(res.body.device_secret).toBeDefined();
    deviceMongoId = res.body.device._id;
    deviceId = res.body.device.device_id;
  });

  test('GET /devices list does not return secret_hash', async () => {
    const res = await request(app).get('/api/sensors/devices')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const d of res.body.devices) {
      expect(d.secret_hash).toBeUndefined();
    }
  });

  test('GET /devices/:id does not return secret_hash', async () => {
    const res = await request(app).get(`/api/sensors/devices/${deviceMongoId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.device.secret_hash).toBeUndefined();
  });

  test('PUT /devices/:id does not return secret_hash', async () => {
    const res = await request(app).put(`/api/sensors/devices/${deviceMongoId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Updated Label' });
    expect(res.status).toBe(200);
    expect(res.body.device.secret_hash).toBeUndefined();
    expect(res.body.device.label).toBe('Updated Label');
  });

  test('POST /devices/:id/rotate-secret does not return secret_hash', async () => {
    const res = await request(app)
      .post(`/api/sensors/devices/${deviceMongoId}/rotate-secret`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.device.secret_hash).toBeUndefined();
    expect(res.body.device_secret).toBeDefined();
  });
});

describe('User Search — phone masking and no sensitive field leakage', () => {
  let dispatcherToken;

  beforeAll(async () => {
    const User = require('../api/src/models/User');
    const { hashPassword, encrypt } = require('../api/src/utils/crypto');

    await User.deleteMany({ username: /^san_search/ });

    await User.create({
      username: 'san_search_encrypted',
      password_hash: await hashPassword('Test1234!'),
      role: 'regular_user',
      display_name: 'Search Encrypted Phone',
      phone: null,
      phone_encrypted: encrypt('4155551234')
    });

    await User.create({
      username: 'san_search_plain',
      password_hash: await hashPassword('Test1234!'),
      role: 'regular_user',
      display_name: 'Search Plain Phone',
      phone: '2125559876',
      phone_encrypted: null
    });

    await User.deleteMany({ username: 'san_dispatcher' });
    await User.create({
      username: 'san_dispatcher',
      password_hash: await hashPassword('Test1234!'),
      role: 'dispatcher',
      display_name: 'San Dispatcher'
    });
    const res = await request(app).post('/api/auth/login')
      .send({ username: 'san_dispatcher', password: 'Test1234!' });
    dispatcherToken = res.body.token;
  });

  test('search results never contain phone_encrypted', async () => {
    const res = await request(app)
      .get('/api/search?q=san_search&type=user')
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThan(0);
    for (const u of res.body.users) {
      expect(u.phone_encrypted).toBeUndefined();
      expect(u.password_hash).toBeUndefined();
    }
  });

  test('search results never contain raw password_hash', async () => {
    const res = await request(app)
      .get('/api/search?q=san_search&type=user')
      .set('Authorization', `Bearer ${dispatcherToken}`);
    for (const u of res.body.users) {
      expect(u.password_hash).toBeUndefined();
    }
  });

  test('phone is masked for user with encrypted-at-rest phone', async () => {
    const res = await request(app)
      .get('/api/search?q=san_search_encrypted&type=user')
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(200);
    const user = res.body.users.find(u => u.username === 'san_search_encrypted');
    expect(user).toBeDefined();
    expect(user.phone).toBeDefined();
    expect(user.phone).toMatch(/\*\*/);
    expect(user.phone).not.toMatch(/4155551234/);
  });

  test('phone is masked for user with plaintext phone field', async () => {
    const res = await request(app)
      .get('/api/search?q=san_search_plain&type=user')
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(200);
    const user = res.body.users.find(u => u.username === 'san_search_plain');
    expect(user).toBeDefined();
    expect(user.phone).toBeDefined();
    expect(user.phone).toMatch(/\*\*/);
    expect(user.phone).not.toMatch(/2125559876/);
  });

  test('fuzzy search path also sanitizes users', async () => {
    const res = await request(app)
      .get('/api/search?q=san_searc_encryptd&type=user')
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(200);
    for (const u of res.body.users) {
      expect(u.phone_encrypted).toBeUndefined();
      expect(u.password_hash).toBeUndefined();
    }
  });
});
