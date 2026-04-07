const request = require('supertest');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app;
let adminToken;
let apiKey;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-ext';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;

  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const ExtensionClient = require('../api/src/models/ExtensionClient');
  const { hashPassword } = require('../api/src/utils/crypto');


  await User.deleteMany({ username: /^ext_api_/ });
  await ExtensionClient.deleteMany({ name: /^ExtAPI/ });

  await User.create({
    username: 'ext_api_admin',
    password_hash: await hashPassword('Admin1234!'),
    role: 'administrator',
    display_name: 'Ext Admin'
  });

  const res = await request(app).post('/api/auth/login')
    .send({ username: 'ext_api_admin', password: 'Admin1234!' });
  adminToken = res.body.token;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  const ExtensionClient = require('../api/src/models/ExtensionClient');
  await User.deleteMany({ username: /^ext_api_/ });
  await ExtensionClient.deleteMany({ name: /^ExtAPI/ });
  await mongoose.disconnect();
});

describe('Extension API — Full Lifecycle', () => {
  test('admin can create extension client and receives API key', async () => {
    const res = await request(app).post('/api/extensions/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'ExtAPI Test Client',
        permissions: [{ resource: 'movies', access: 'read' }],
        rate_limit: 120
      });
    expect(res.status).toBe(201);
    expect(res.body.api_key).toBeDefined();
    expect(res.body.client.name).toBe('ExtAPI Test Client');
    apiKey = res.body.api_key;
  });

  test('valid API key returns movies', async () => {
    const res = await request(app).get('/api/extensions/movies')
      .set('X-API-Key', apiKey);
    expect(res.status).toBe(200);
    expect(res.body.movies).toBeDefined();
  });

  test('invalid API key returns 401', async () => {
    const res = await request(app).get('/api/extensions/movies')
      .set('X-API-Key', 'totally-invalid-key-1234567890abcdef1234567890abcdef');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('missing API key returns 401', async () => {
    const res = await request(app).get('/api/extensions/movies');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('valid key without permission returns 403', async () => {
    const res = await request(app).get('/api/extensions/content')
      .set('X-API-Key', apiKey);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('valid key without rides permission returns 403', async () => {
    const res = await request(app).get('/api/extensions/rides')
      .set('X-API-Key', apiKey);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('rate limit exceeded returns 429', async () => {
    const createRes = await request(app).post('/api/extensions/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'ExtAPI Rate Limited',
        permissions: [{ resource: 'movies', access: 'read' }],
        rate_limit: 2
      });
    expect(createRes.status).toBe(201);
    const limitedKey = createRes.body.api_key;

    await request(app).get('/api/extensions/movies').set('X-API-Key', limitedKey);
    await request(app).get('/api/extensions/movies').set('X-API-Key', limitedKey);

    const res = await request(app).get('/api/extensions/movies')
      .set('X-API-Key', limitedKey);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });

  test('admin can list extension clients without exposing sensitive fields', async () => {
    const res = await request(app).get('/api/extensions/clients')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.clients.length).toBeGreaterThanOrEqual(1);
    for (const client of res.body.clients) {
      expect(client.api_key_hash).toBeUndefined();
      expect(client.rate_limit_hits).toBeUndefined();
    }
  });
});
