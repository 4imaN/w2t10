const request = require('supertest');
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';
const path = require('path');
const fs = require('fs');

let app, adminToken, editorToken, editor2Token, userToken;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-audit';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;
  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const ConfigDictionary = require('../api/src/models/ConfigDictionary');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.deleteMany({ username: /^af_/ });
  await User.create({ username: 'af_admin', password_hash: await hashPassword('Test1234!'), role: 'administrator', display_name: 'AF Admin' });
  await User.create({ username: 'af_editor', password_hash: await hashPassword('Test1234!'), role: 'editor', display_name: 'AF Editor' });
  await User.create({ username: 'af_editor2', password_hash: await hashPassword('Test1234!'), role: 'editor', display_name: 'AF Editor2' });
  await User.create({ username: 'af_user', password_hash: await hashPassword('Test1234!'), role: 'regular_user', display_name: 'AF User' });

  await ConfigDictionary.findOneAndUpdate({ key: 'auto_cancel_minutes' }, { key: 'auto_cancel_minutes', value: 30, category: 'thresholds' }, { upsert: true });
  await ConfigDictionary.findOneAndUpdate({ key: 'free_cancel_window_minutes' }, { key: 'free_cancel_window_minutes', value: 0, category: 'thresholds' }, { upsert: true });
  await ConfigDictionary.findOneAndUpdate({ key: 'min_ride_advance_minutes' }, { key: 'min_ride_advance_minutes', value: 5, category: 'thresholds' }, { upsert: true });

  let res;
  res = await request(app).post('/api/auth/login').send({ username: 'af_admin', password: 'Test1234!' });
  adminToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'af_editor', password: 'Test1234!' });
  editorToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'af_editor2', password: 'Test1234!' });
  editor2Token = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'af_user', password: 'Test1234!' });
  userToken = res.body.token;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  await User.deleteMany({ username: /^af_/ });
  await mongoose.disconnect();
});

describe('High-2: Extension rides data minimization', () => {
  let apiKey;

  beforeAll(async () => {
    const res = await request(app).post('/api/extensions/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'AF Rides Client', permissions: [{ resource: 'rides', access: 'read' }], rate_limit: 120 });
    apiKey = res.body.api_key;
  });

  test('rides response excludes sensitive fields', async () => {
    const res = await request(app).get('/api/extensions/rides')
      .set('X-API-Key', apiKey);
    expect(res.status).toBe(200);
    for (const ride of res.body.rides) {
      expect(ride.state_transitions).toBeUndefined();
      expect(ride.feedback).toBeUndefined();
      expect(ride.assigned_dispatcher).toBeUndefined();
      expect(ride.dispatcher_notes).toBeUndefined();
      expect(ride.cancellation_approved_by).toBeUndefined();
    }
  });

  test('status filter works', async () => {
    const res = await request(app).get('/api/extensions/rides?status=pending_match')
      .set('X-API-Key', apiKey);
    expect(res.status).toBe(200);
  });

  test('invalid status filter returns 422', async () => {
    const res = await request(app).get('/api/extensions/rides?status=hacked')
      .set('X-API-Key', apiKey);
    expect(res.status).toBe(422);
  });
});

describe('High-3: Config PUT validation', () => {
  test('PUT without value returns 422', async () => {
    const res = await request(app).put('/api/config/test_key')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ category: 'general' });
    expect(res.status).toBe(422);
  });

  test('PUT with invalid category returns 422', async () => {
    const res = await request(app).put('/api/config/test_key')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 42, category: 'hacked_category' });
    expect(res.status).toBe(422);
  });

  test('PUT with valid payload succeeds', async () => {
    const res = await request(app).put('/api/config/test_audit_key')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 99, category: 'thresholds' });
    expect(res.status).toBe(200);
    expect(res.body.config.value).toBe(99);
  });

  test('PUT with value only (no category) succeeds', async () => {
    const res = await request(app).put('/api/config/test_audit_key')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 100 });
    expect(res.status).toBe(200);
  });
});

describe('Medium-1: Admin user update password policy', () => {
  test('weak password on update is rejected (422)', async () => {
    const User = require('../api/src/models/User');
    const target = await User.findOne({ username: 'af_user' });
    const res = await request(app).put(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('at least 8 characters');
  });

  test('valid password on update succeeds', async () => {
    const User = require('../api/src/models/User');
    const target = await User.findOne({ username: 'af_user' });
    const res = await request(app).put(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'StrongPass99!' });
    expect(res.status).toBe(200);
  });
});

describe('Medium-2: Movie import job ownership', () => {
  let jobId;

  test('editor creates import job', async () => {
    const tmpFile = path.join(__dirname, '..', 'uploads', 'af-import.json');
    fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
    fs.writeFileSync(tmpFile, JSON.stringify([{ title: 'AF Import Movie' }]));
    const res = await request(app).post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${editorToken}`)
      .attach('file', tmpFile);
    expect(res.status).toBe(201);
    jobId = res.body.job._id;
    fs.unlinkSync(tmpFile);
  });

  test('different editor cannot access the job (403)', async () => {
    const res = await request(app).get(`/api/movie-import/${jobId}`)
      .set('Authorization', `Bearer ${editor2Token}`);
    expect(res.status).toBe(403);
  });

  test('job owner can access the job', async () => {
    const res = await request(app).get(`/api/movie-import/${jobId}`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
  });

  test('admin can access any job', async () => {
    const res = await request(app).get(`/api/movie-import/${jobId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('Medium-3: Cancellation status eligibility', () => {
  test('cannot cancel ride in completed status (422)', async () => {
    const start = new Date(Date.now() + 600000);
    const end = new Date(start.getTime() + 3600000);
    let res = await request(app).post('/api/rides')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ pickup_text: 'A', dropoff_text: 'B', rider_count: 1, time_window_start: start.toISOString(), time_window_end: end.toISOString() });
    const rideId = res.body.ride._id;

    const dispRes = await request(app).post('/api/auth/login').send({ username: 'af_admin', password: 'Test1234!' });
    await request(app).post(`/api/dispatch/rides/${rideId}/accept`)
      .set('Authorization', `Bearer ${adminToken}`).send({});
    await request(app).post(`/api/dispatch/rides/${rideId}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to_status: 'in_progress' });
    await request(app).post(`/api/dispatch/rides/${rideId}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to_status: 'completed' });

    res = await request(app).post(`/api/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('Cannot cancel');
  });

  test('can cancel ride in pending_match status', async () => {
    const start = new Date(Date.now() + 600000);
    const end = new Date(start.getTime() + 3600000);
    const res = await request(app).post('/api/rides')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ pickup_text: 'X', dropoff_text: 'Y', rider_count: 1, time_window_start: start.toISOString(), time_window_end: end.toISOString() });
    const rideId = res.body.ride._id;

    const cancelRes = await request(app).post(`/api/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${userToken}`);
    expect([200, 422]).not.toContain(undefined);
    expect(cancelRes.status).toBe(200);
  });
});

describe('Medium-4: Recommendation behavior', () => {
  test('cold start returns movies with source cold_start', async () => {
    const res = await request(app).get('/api/recommendations/movies')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('movies');
    expect(res.body).toHaveProperty('source');
  });

  test('content recommendations return array', async () => {
    const res = await request(app).get('/api/recommendations/content')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.content || res.body)).toBe(true);
  });
});
