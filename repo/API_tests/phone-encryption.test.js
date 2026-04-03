const request = require('supertest');
const { startTestDb, stopTestDb } = require('./helpers/setup');

let app, token;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-phone-enc';
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';

  await startTestDb();
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.create({
    username: 'phone_admin',
    password_hash: await hashPassword('Test1234!'),
    role: 'administrator',
    display_name: 'Phone Admin'
  });

  const res = await request(app).post('/api/auth/login')
    .send({ username: 'phone_admin', password: 'Test1234!' });
  token = res.body.token;
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

describe('Phone Encryption at Rest', () => {
  let userId;

  test('creating user with phone stores encrypted, not plaintext', async () => {
    const res = await request(app).post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'enc_user',
        password: 'Test1234!',
        role: 'regular_user',
        display_name: 'Encrypted',
        phone: '4155559876'
      });
    expect(res.status).toBe(201);
    userId = res.body.user._id;

    const User = require('../api/src/models/User');
    const raw = await User.findById(userId).lean();
    expect(raw.phone).toBeNull();
    expect(raw.phone_encrypted).toBeTruthy();
    expect(raw.phone_encrypted).not.toBe('4155559876');
    expect(raw.phone_encrypted).toContain(':');
  });

  test('API response returns masked phone, not raw or encrypted', async () => {
    const res = await request(app).get(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe('(415) ***-**76');
    expect(res.body.user.phone_encrypted).toBeUndefined();
  });

  test('updating phone encrypts the new value', async () => {
    const res = await request(app).put(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '2125551234' });
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe('(212) ***-**34');

    const User = require('../api/src/models/User');
    const raw = await User.findById(userId).lean();
    expect(raw.phone).toBeNull();
    expect(raw.phone_encrypted).toBeTruthy();
  });

  test('migration converts plaintext phones to encrypted', async () => {
    const User = require('../api/src/models/User');
    await User.create({
      username: 'legacy_user',
      password_hash: 'hash',
      role: 'regular_user',
      display_name: 'Legacy',
      phone: '3105551111',
      phone_encrypted: null
    });

    const { migratePhonesToEncrypted } = require('../api/src/services/user.service');
    const count = await migratePhonesToEncrypted();
    expect(count).toBe(1);

    const raw = await User.findOne({ username: 'legacy_user' }).lean();
    expect(raw.phone).toBeNull();
    expect(raw.phone_encrypted).toBeTruthy();
  });

  test('raw phone number never appears in list response', async () => {
    const res = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${token}`);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('4155559876');
    expect(body).not.toContain('2125551234');
    expect(body).not.toContain('3105551111');
    expect(body).not.toContain('phone_encrypted');
  });
});
