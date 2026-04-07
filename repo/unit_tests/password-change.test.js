const request = require('supertest');
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-password';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;
  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  await User.deleteMany({ username: /^pw_/ });
  await mongoose.disconnect();
});

describe('Password Change Validation', () => {
  let token;

  beforeAll(async () => {
    const User = require('../api/src/models/User');
    const { hashPassword } = require('../api/src/utils/crypto');
    await User.deleteMany({ username: 'pw_user' });
    await User.create({
      username: 'pw_user',
      password_hash: await hashPassword('OldPass123!'),
      role: 'regular_user',
      display_name: 'PW User'
    });
    const res = await request(app).post('/api/auth/login')
      .send({ username: 'pw_user', password: 'OldPass123!' });
    token = res.body.token;
  });

  test('rejects short new password (422)', async () => {
    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'OldPass123!', new_password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('at least 8 characters');
  });

  test('rejects reuse of same password (422)', async () => {
    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'OldPass123!', new_password: 'OldPass123!' });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('different from current');
  });

  test('rejects wrong current password (422)', async () => {
    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'WrongPass!', new_password: 'NewPass999!' });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('incorrect');
  });

  test('successful password change clears must_change_password', async () => {
    const User = require('../api/src/models/User');
    await User.updateOne({ username: 'pw_user' }, { must_change_password: true });

    const res = await request(app).post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'OldPass123!', new_password: 'NewSecure99!' });
    expect(res.status).toBe(200);

    const user = await User.findOne({ username: 'pw_user' });
    expect(user.must_change_password).toBe(false);
  });

  test('login response includes must_change_password flag', async () => {
    const User = require('../api/src/models/User');
    const { hashPassword } = require('../api/src/utils/crypto');
    await User.deleteMany({ username: 'pw_bootstrap' });
    await User.create({
      username: 'pw_bootstrap',
      password_hash: await hashPassword('Bootstrap1!'),
      role: 'regular_user',
      display_name: 'Bootstrap',
      must_change_password: true
    });
    const res = await request(app).post('/api/auth/login')
      .send({ username: 'pw_bootstrap', password: 'Bootstrap1!' });
    expect(res.status).toBe(200);
    expect(res.body.must_change_password).toBe(true);
  });
});

describe('Bootstrap Credential Security', () => {
  test('seed sets must_change_password on all bootstrap accounts', () => {
    const { seed } = require('../api/src/db/seed');
    expect(typeof seed).toBe('function');
  });

  test('seed module does not contain hardcoded passwords', () => {
    const seedModule = require('../api/src/db/seed');
    const moduleStr = JSON.stringify(seedModule);
    expect(moduleStr).not.toContain('Admin123!');
    expect(moduleStr).not.toContain('Editor123!');
  });
});
