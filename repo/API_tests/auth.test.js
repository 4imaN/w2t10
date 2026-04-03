const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../api/src/app');
const User = require('../api/src/models/User');
const { hashPassword } = require('../api/src/utils/crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let adminToken;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  await User.deleteMany({});
  await User.create({
    username: 'testadmin',
    password_hash: await hashPassword('Admin123!'),
    role: 'administrator',
    display_name: 'Test Admin',
    phone: '4155551001'
  });
});

afterAll(async () => {
  await User.deleteMany({});
  await mongoose.disconnect();
});

describe('Auth API', () => {
  test('POST /api/auth/login — success', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testadmin', password: 'Admin123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('testadmin');
    expect(res.body.user.role).toBe('administrator');
    adminToken = res.body.token;
  });

  test('POST /api/auth/login — invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testadmin', password: 'wrong' });
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
    expect(res.body.user.username).toBe('testadmin');
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
    // Login first to get a token to revoke
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testadmin', password: 'Admin123!' });
    const token = loginRes.body.token;

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    // Token should no longer work
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(401);
  });
});
