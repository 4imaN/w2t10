const request = require('supertest');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app;
let tokens = {};

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-rbac-unit';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;

  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const ConfigDictionary = require('../api/src/models/ConfigDictionary');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.deleteMany({ username: /^rbac2_/ });

  await ConfigDictionary.findOneAndUpdate(
    { key: 'auto_cancel_minutes' }, { key: 'auto_cancel_minutes', value: 30, category: 'thresholds' }, { upsert: true }
  );
  await ConfigDictionary.findOneAndUpdate(
    { key: 'free_cancel_window_minutes' }, { key: 'free_cancel_window_minutes', value: 5, category: 'thresholds' }, { upsert: true }
  );
  await ConfigDictionary.findOneAndUpdate(
    { key: 'min_ride_advance_minutes' }, { key: 'min_ride_advance_minutes', value: 5, category: 'thresholds' }, { upsert: true }
  );

  const roles = [
    { username: 'rbac2_admin', role: 'administrator' },
    { username: 'rbac2_editor', role: 'editor' },
    { username: 'rbac2_reviewer', role: 'reviewer' },
    { username: 'rbac2_dispatcher', role: 'dispatcher' },
    { username: 'rbac2_user', role: 'regular_user' },
  ];

  for (const r of roles) {
    await User.create({
      username: r.username,
      password_hash: await hashPassword('Test1234!'),
      role: r.role,
      display_name: r.username
    });
    const res = await request(app).post('/api/auth/login')
      .send({ username: r.username, password: 'Test1234!' });
    tokens[r.role] = res.body.token;
  }
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  await User.deleteMany({ username: /^rbac2_/ });
  await mongoose.disconnect();
});

describe('Route-Level RBAC Enforcement — Real Requests', () => {
  test('user routes require admin — non-admin gets 403', async () => {
    const res = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${tokens.regular_user}`);
    expect(res.status).toBe(403);
  });

  test('user routes — admin gets 200', async () => {
    const res = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${tokens.administrator}`);
    expect(res.status).toBe(200);
  });

  test('config routes require admin — dispatcher gets 403', async () => {
    const res = await request(app).get('/api/config')
      .set('Authorization', `Bearer ${tokens.dispatcher}`);
    expect(res.status).toBe(403);
  });

  test('config routes — admin gets 200', async () => {
    const res = await request(app).get('/api/config')
      .set('Authorization', `Bearer ${tokens.administrator}`);
    expect(res.status).toBe(200);
  });

  test('dispatch routes — dispatcher gets 200', async () => {
    const res = await request(app).get('/api/dispatch/queue')
      .set('Authorization', `Bearer ${tokens.dispatcher}`);
    expect(res.status).toBe(200);
  });

  test('dispatch routes — editor gets 403', async () => {
    const res = await request(app).get('/api/dispatch/queue')
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(403);
  });

  test('movie create requires staff — regular user gets 403', async () => {
    const res = await request(app).post('/api/movies')
      .set('Authorization', `Bearer ${tokens.regular_user}`)
      .send({ title: 'Test', description: 'test' });
    expect(res.status).toBe(403);
  });

  test('content create requires staff — regular user gets 403', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${tokens.regular_user}`)
      .send({ title: 'Test', body: 'test', content_type: 'article' });
    expect(res.status).toBe(403);
  });

  test('content create — editor gets 201', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${tokens.editor}`)
      .send({ title: 'RBAC Test Article', body: 'test body', content_type: 'article' });
    expect(res.status).toBe(201);
  });

  test('unauthenticated requests return 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('health endpoint is public', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('Object-Level Authorization — Real Requests', () => {
  let rideId;

  test('regular user can create ride', async () => {
    const start = new Date(Date.now() + 600000);
    const end = new Date(start.getTime() + 3600000);
    const res = await request(app).post('/api/rides')
      .set('Authorization', `Bearer ${tokens.regular_user}`)
      .send({
        pickup_text: 'A place', dropoff_text: 'B place',
        rider_count: 1,
        time_window_start: start.toISOString(),
        time_window_end: end.toISOString()
      });
    expect(res.status).toBe(201);
    rideId = res.body.ride._id;
  });

  test('ride owner can read own ride', async () => {
    const res = await request(app).get(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${tokens.regular_user}`);
    expect(res.status).toBe(200);
  });

  test('dispatcher can read any ride', async () => {
    const res = await request(app).get(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${tokens.dispatcher}`);
    expect(res.status).toBe(200);
  });
});
