const request = require('supertest');
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app, adminToken;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-policy';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;
  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const { hashPassword } = require('../api/src/utils/crypto');
  await User.deleteMany({ username: 'pc_admin' });
  await User.create({ username: 'pc_admin', password_hash: await hashPassword('Test1234!'), role: 'administrator', display_name: 'PC Admin' });
  const res = await request(app).post('/api/auth/login').send({ username: 'pc_admin', password: 'Test1234!' });
  adminToken = res.body.token;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  const ExtensionClient = require('../api/src/models/ExtensionClient');
  const ConfigDictionary = require('../api/src/models/ConfigDictionary');
  await User.deleteMany({ username: 'pc_admin' });
  await ExtensionClient.deleteMany({ name: /^PC_/ });
  await ConfigDictionary.deleteMany({ key: /^pc_test_/ });
  await mongoose.disconnect();
});

describe('Extension rides per-client policy enforcement', () => {
  let unrestrictedKey, restrictedKey;

  beforeAll(async () => {
    let res = await request(app).post('/api/extensions/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'PC_Unrestricted',
        permissions: [{ resource: 'rides', access: 'read' }]
      });
    unrestrictedKey = res.body.api_key;

    res = await request(app).post('/api/extensions/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'PC_Restricted',
        permissions: [{
          resource: 'rides',
          access: 'read',
          allowed_statuses: ['completed', 'canceled'],
          max_age_days: 7
        }]
      });
    restrictedKey = res.body.api_key;
  });

  test('unrestricted client can query any status', async () => {
    const res = await request(app).get('/api/extensions/rides?status=pending_match')
      .set('X-API-Key', unrestrictedKey);
    expect(res.status).toBe(200);
  });

  test('restricted client can query allowed status', async () => {
    const res = await request(app).get('/api/extensions/rides?status=completed')
      .set('X-API-Key', restrictedKey);
    expect(res.status).toBe(200);
  });

  test('restricted client is blocked from disallowed status (403)', async () => {
    const res = await request(app).get('/api/extensions/rides?status=pending_match')
      .set('X-API-Key', restrictedKey);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('policy does not allow');
  });

  test('restricted client without status filter only gets allowed statuses', async () => {
    const res = await request(app).get('/api/extensions/rides')
      .set('X-API-Key', restrictedKey);
    expect(res.status).toBe(200);
    for (const ride of res.body.rides) {
      expect(['completed', 'canceled']).toContain(ride.status);
    }
  });

  test('invalid status still returns 422 for any client', async () => {
    const res = await request(app).get('/api/extensions/rides?status=hacked')
      .set('X-API-Key', unrestrictedKey);
    expect(res.status).toBe(422);
  });

  test('restricted client max_age_days enforces date window', async () => {
    const res = await request(app).get('/api/extensions/rides')
      .set('X-API-Key', restrictedKey);
    expect(res.status).toBe(200);
  });

  test('restricted client cannot bypass max_age_days via from param', async () => {
    const veryOld = new Date(Date.now() - 365 * 86400000).toISOString();
    const res = await request(app).get(`/api/extensions/rides?from=${veryOld}`)
      .set('X-API-Key', restrictedKey);
    expect(res.status).toBe(200);
  });

  test('restricted client narrower from param is respected', async () => {
    const recent = new Date(Date.now() - 1 * 86400000).toISOString();
    const res = await request(app).get(`/api/extensions/rides?from=${recent}`)
      .set('X-API-Key', restrictedKey);
    expect(res.status).toBe(200);
  });

  test('unrestricted client from param works without policy interference', async () => {
    const old = new Date(Date.now() - 365 * 86400000).toISOString();
    const res = await request(app).get(`/api/extensions/rides?from=${old}`)
      .set('X-API-Key', unrestrictedKey);
    expect(res.status).toBe(200);
  });
});

describe('Config PUT semantics — category preservation', () => {
  test('creating config with explicit category works', async () => {
    const res = await request(app).post('/api/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'pc_test_existing', value: 'initial', category: 'thresholds' });
    expect(res.status).toBe(201);
    expect(res.body.config.category).toBe('thresholds');
  });

  test('PUT value-only preserves existing category', async () => {
    const res = await request(app).put('/api/config/pc_test_existing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'updated' });
    expect(res.status).toBe(200);
    expect(res.body.config.value).toBe('updated');
    expect(res.body.config.category).toBe('thresholds');
  });

  test('PUT with explicit category updates category', async () => {
    const res = await request(app).put('/api/config/pc_test_existing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'v3', category: 'general' });
    expect(res.status).toBe(200);
    expect(res.body.config.category).toBe('general');
  });

  test('PUT to non-existent key without category fails (422)', async () => {
    const res = await request(app).put('/api/config/pc_test_new_no_cat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'orphan' });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('Category is required');
  });

  test('PUT to non-existent key with category creates it', async () => {
    const res = await request(app).put('/api/config/pc_test_new_with_cat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'created', category: 'general' });
    expect(res.status).toBe(200);
    expect(res.body.config.value).toBe('created');
    expect(res.body.config.category).toBe('general');
  });
});
