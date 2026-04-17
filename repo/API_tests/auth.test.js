const request = require('supertest');
const { startTestDb, stopTestDb } = require('./helpers/setup');

let app, adminToken;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret-auth';
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';

  await startTestDb();

  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.create({
    username: 'auth_testadmin',
    password_hash: await hashPassword('Admin123!'),
    role: 'administrator',
    display_name: 'Test Admin',
    phone: '4155551001'
  });
});

afterAll(async () => {
  await stopTestDb();
});

describe('Auth API', () => {
  test('POST /api/auth/login — success', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'auth_testadmin', password: 'Admin123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('auth_testadmin');
    expect(res.body.user.role).toBe('administrator');
    adminToken = res.body.token;
  });

  test('POST /api/auth/login — invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'auth_testadmin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/auth/login — missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});
    expect(res.status).toBe(422);
  });

  test('GET /api/auth/me — returns current user', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('auth_testadmin');
  });

  test('GET /api/auth/me — unauthorized without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/sessions — returns active sessions', async () => {
    const res = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });

  test('POST /api/auth/logout — revokes session', async () => {
    // Use the token already obtained from the first login test
    // This avoids potential race conditions with a second login
    expect(adminToken).toBeTruthy();

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // Token should no longer work
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(meRes.status).toBe(401);
  });
});
