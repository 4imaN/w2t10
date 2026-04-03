const request = require('supertest');
const { startTestDb, stopTestDb } = require('./helpers/setup');

let app;
let token;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-password-gate';
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';

  await startTestDb();
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.create({
    username: 'gate_user',
    password_hash: await hashPassword('Bootstrap1!'),
    role: 'regular_user',
    display_name: 'Gate User',
    must_change_password: true
  });

  const res = await request(app).post('/api/auth/login')
    .send({ username: 'gate_user', password: 'Bootstrap1!' });
  token = res.body.token;
  expect(res.body.must_change_password).toBe(true);
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

describe('must_change_password server-side gate', () => {
  test('GET /api/auth/me is allowed', async () => {
    const res = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/auth/sessions is allowed', async () => {
    const res = await request(app).get('/api/auth/sessions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/movies is blocked (403 PASSWORD_CHANGE_REQUIRED)', async () => {
    const res = await request(app).get('/api/movies')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  test('GET /api/content is blocked', async () => {
    const res = await request(app).get('/api/content')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  test('GET /api/rides is blocked', async () => {
    const res = await request(app).get('/api/rides')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  test('POST /api/search is blocked', async () => {
    const res = await request(app).get('/api/search?q=test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('POST /api/auth/change-password is allowed', async () => {
    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'Bootstrap1!', new_password: 'NewSecure99!' });
    expect(res.status).toBe(200);
  });

  test('after change, normal access works', async () => {
    const loginRes = await request(app).post('/api/auth/login')
      .send({ username: 'gate_user', password: 'NewSecure99!' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.must_change_password).toBe(false);

    const res = await request(app).get('/api/movies')
      .set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(200);
  });
});
