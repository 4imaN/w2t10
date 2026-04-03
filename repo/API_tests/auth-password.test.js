const request = require('supertest');
const { startTestDb, stopTestDb, clearCollections } = require('./helpers/setup');

let app;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-api-tests';
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';

  await startTestDb();
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.create({
    username: 'pwtest_admin',
    password_hash: await hashPassword('OldPass123!'),
    role: 'administrator',
    display_name: 'PW Admin',
    must_change_password: true
  });
});

afterAll(async () => {
  await stopTestDb();
});

describe('Password Change (executable)', () => {
  let token;

  test('login succeeds and returns must_change_password flag', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'pwtest_admin', password: 'OldPass123!' });
    expect(res.status).toBe(200);
    expect(res.body.must_change_password).toBe(true);
    token = res.body.token;
  });

  test('change-password rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(422);
  });

  test('change-password rejects wrong current password', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'WrongPass!', new_password: 'NewPass456!' });
    expect(res.status).toBe(422);
  });

  test('change-password rejects too-short new password', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'OldPass123!', new_password: 'short' });
    expect(res.status).toBe(422);
  });

  test('change-password rejects same password', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'OldPass123!', new_password: 'OldPass123!' });
    expect(res.status).toBe(422);
  });

  test('change-password succeeds with valid input', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'OldPass123!', new_password: 'NewSecure456!' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('changed');
  });

  test('login with new password works and flag is cleared', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'pwtest_admin', password: 'NewSecure456!' });
    expect(res.status).toBe(200);
    expect(res.body.must_change_password).toBe(false);
  });

  test('login with old password fails', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'pwtest_admin', password: 'OldPass123!' });
    expect(res.status).toBe(401);
  });
});
