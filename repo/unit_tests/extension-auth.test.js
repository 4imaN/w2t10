const request = require('supertest');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app;
let adminToken;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-ext-unit';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;

  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const ExtensionClient = require('../api/src/models/ExtensionClient');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.deleteMany({ username: /^ext_unit_/ });
  await ExtensionClient.deleteMany({ name: /^ExtUnit/ });

  await User.create({
    username: 'ext_unit_admin',
    password_hash: await hashPassword('Admin1234!'),
    role: 'administrator',
    display_name: 'Ext Unit Admin'
  });

  const res = await request(app).post('/api/auth/login')
    .send({ username: 'ext_unit_admin', password: 'Admin1234!' });
  adminToken = res.body.token;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  const ExtensionClient = require('../api/src/models/ExtensionClient');
  await User.deleteMany({ username: /^ext_unit_/ });
  await ExtensionClient.deleteMany({ name: /^ExtUnit/ });
  await mongoose.disconnect();
});

describe('Extension Endpoint Auth & Permissions — Behavioral', () => {
  let validKey;

  test('creating client requires admin auth', async () => {
    const User = require('../api/src/models/User');
    const { hashPassword } = require('../api/src/utils/crypto');
    await User.deleteMany({ username: 'ext_unit_regular' });
    await User.create({
      username: 'ext_unit_regular',
      password_hash: await hashPassword('Test1234!'),
      role: 'regular_user',
      display_name: 'Regular'
    });
    const loginRes = await request(app).post('/api/auth/login')
      .send({ username: 'ext_unit_regular', password: 'Test1234!' });
    const userToken = loginRes.body.token;

    const res = await request(app).post('/api/extensions/clients')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Unauthorized', permissions: [] });
    expect(res.status).toBe(403);
  });

  test('admin can create client', async () => {
    const res = await request(app).post('/api/extensions/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'ExtUnit Test Client',
        permissions: [
          { resource: 'movies', access: 'read' },
          { resource: 'content', access: 'read' }
        ]
      });
    expect(res.status).toBe(201);
    expect(res.body.api_key).toBeDefined();
    validKey = res.body.api_key;
  });

  test('extension data endpoints use API key auth (no key → 401)', async () => {
    const res = await request(app).get('/api/extensions/movies');
    expect(res.status).toBe(401);
  });

  test('API key is verified via bcrypt (invalid → 401)', async () => {
    const res = await request(app).get('/api/extensions/movies')
      .set('X-API-Key', 'wrong-key-0000000000000000000000000000000000000000');
    expect(res.status).toBe(401);
  });

  test('valid key with permission returns 200', async () => {
    const res = await request(app).get('/api/extensions/movies')
      .set('X-API-Key', validKey);
    expect(res.status).toBe(200);
  });

  test('valid key for content also works', async () => {
    const res = await request(app).get('/api/extensions/content')
      .set('X-API-Key', validKey);
    expect(res.status).toBe(200);
  });

  test('missing permission returns 403', async () => {
    const res = await request(app).get('/api/extensions/rides')
      .set('X-API-Key', validKey);
    expect(res.status).toBe(403);
  });

  test('rate limiting is enforced', async () => {
    const createRes = await request(app).post('/api/extensions/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'ExtUnit Tiny Limit',
        permissions: [{ resource: 'movies', access: 'read' }],
        rate_limit: 1
      });
    const limitedKey = createRes.body.api_key;

    await request(app).get('/api/extensions/movies').set('X-API-Key', limitedKey);

    const res = await request(app).get('/api/extensions/movies')
      .set('X-API-Key', limitedKey);
    expect(res.status).toBe(429);
  });
});
