const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../api/src/app');
const User = require('../api/src/models/User');
const { hashPassword } = require('../api/src/utils/crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let adminToken, userToken;
let createdUserId;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  await User.deleteMany({});

  await User.insertMany([
    {
      username: 'mask_admin',
      password_hash: await hashPassword('Pass1234!'),
      role: 'administrator',
      display_name: 'Admin',
      phone: '4155551001'
    },
    {
      username: 'mask_user',
      password_hash: await hashPassword('Pass1234!'),
      role: 'regular_user',
      display_name: 'User',
      phone: '4155559921'
    },
  ]);

  let res = await request(app).post('/api/auth/login').send({ username: 'mask_admin', password: 'Pass1234!' });
  adminToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'mask_user', password: 'Pass1234!' });
  userToken = res.body.token;
});

afterAll(async () => {
  await User.deleteMany({});
  await mongoose.disconnect();
});

describe('Phone Masking in API Responses', () => {
  test('Admin listing users sees masked phone, not raw digits', async () => {
    const res = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    for (const u of res.body.users) {
      if (u.phone) {
        // Must look like (415) ***-**01 — never raw digits
        expect(u.phone).toMatch(/\(\d{3}\) \*{3}-\*{2}\d{2}/);
        expect(u.phone).not.toMatch(/^\d{10,}$/); // no raw 10-digit number
      }
    }
  });

  test('Admin GET user by id sees masked phone', async () => {
    const list = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    const target = list.body.users.find(u => u.username === 'mask_user');

    const res = await request(app).get(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toMatch(/\(\d{3}\) \*{3}-\*{2}\d{2}/);
    expect(res.body.user.phone).toBe('(415) ***-**21');
  });

  test('Admin creating user returns masked phone in response', async () => {
    const res = await request(app).post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'mask_new',
        password: 'NewPass123!',
        role: 'regular_user',
        display_name: 'New Masked',
        phone: '2125559876'
      });
    expect(res.status).toBe(201);
    // Response phone should be masked
    expect(res.body.user.phone).toBe('(212) ***-**76');
    createdUserId = res.body.user._id;
  });

  test('Admin updating user returns masked phone', async () => {
    const res = await request(app).put(`/api/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: '3105551234' });
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe('(310) ***-**34');
  });

  test('Search results return masked phone for admin', async () => {
    const res = await request(app).get('/api/search?q=mask_user&type=user')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const u of res.body.users || []) {
      if (u.phone) {
        expect(u.phone).toMatch(/\(\d{3}\) \*{3}-\*{2}\d{2}/);
      }
    }
  });

  test('Raw phone number is never in any user API response', async () => {
    const res = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    const body = JSON.stringify(res.body);
    // None of the raw phone numbers should appear in the serialized response
    expect(body).not.toContain('4155551001');
    expect(body).not.toContain('4155559921');
  });
});
