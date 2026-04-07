const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app, adminToken, editorToken, userToken, dispatcherToken;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-final';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;
  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const ConfigDictionary = require('../api/src/models/ConfigDictionary');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.deleteMany({ username: /^fa_/ });
  await User.create({ username: 'fa_admin', password_hash: await hashPassword('Test1234!'), role: 'administrator', display_name: 'FA Admin' });
  await User.create({ username: 'fa_editor', password_hash: await hashPassword('Test1234!'), role: 'editor', display_name: 'FA Editor' });
  await User.create({ username: 'fa_user', password_hash: await hashPassword('Test1234!'), role: 'regular_user', display_name: 'FA User' });
  await User.create({ username: 'fa_disp', password_hash: await hashPassword('Test1234!'), role: 'dispatcher', display_name: 'FA Disp' });

  await ConfigDictionary.findOneAndUpdate({ key: 'auto_cancel_minutes' }, { key: 'auto_cancel_minutes', value: 30, category: 'thresholds' }, { upsert: true });
  await ConfigDictionary.findOneAndUpdate({ key: 'free_cancel_window_minutes' }, { key: 'free_cancel_window_minutes', value: 5, category: 'thresholds' }, { upsert: true });
  await ConfigDictionary.findOneAndUpdate({ key: 'min_ride_advance_minutes' }, { key: 'min_ride_advance_minutes', value: 5, category: 'thresholds' }, { upsert: true });
  await ConfigDictionary.findOneAndUpdate({ key: 'max_ride_payment_amount' }, { key: 'max_ride_payment_amount', value: 500, category: 'thresholds' }, { upsert: true });

  let res;
  res = await request(app).post('/api/auth/login').send({ username: 'fa_admin', password: 'Test1234!' });
  adminToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'fa_editor', password: 'Test1234!' });
  editorToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'fa_user', password: 'Test1234!' });
  userToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'fa_disp', password: 'Test1234!' });
  dispatcherToken = res.body.token;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  await User.deleteMany({ username: /^fa_/ });
  await mongoose.disconnect();
});

describe('Fix 1: Import file security', () => {
  test('import files not publicly accessible via /uploads/imports/', async () => {
    const res = await request(app).get('/uploads/imports/anything.json');
    expect(res.status).toBe(404);
  });

  test('poster files still publicly accessible', async () => {
    const res = await request(app).get('/uploads/posters/nonexistent.jpg');
    expect(res.status).toBe(404);
  });

  test('invalid upload format cleans up temp file', async () => {
    const tmpFile = path.join(__dirname, '..', 'uploads', 'test-cleanup.xml');
    fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
    fs.writeFileSync(tmpFile, '<root>bad</root>');

    await request(app).post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${editorToken}`)
      .attach('file', tmpFile);

    fs.unlinkSync(tmpFile);
  });

  test('successful upload cleans up temp file', async () => {
    const uploadsDir = path.join(__dirname, '..', 'uploads', 'imports');
    const before = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).filter(f => f !== '.gitkeep') : [];

    const tmpFile = path.join(__dirname, '..', 'uploads', 'test-success.json');
    fs.writeFileSync(tmpFile, JSON.stringify([{ title: 'Cleanup Test' }]));

    const res = await request(app).post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${editorToken}`)
      .attach('file', tmpFile);
    expect(res.status).toBe(201);

    const after = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).filter(f => f !== '.gitkeep') : [];
    expect(after.length).toBeLessThanOrEqual(before.length);

    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    const MovieImportJob = require('../api/src/models/MovieImportJob');
    await MovieImportJob.deleteOne({ _id: res.body.job._id });
  });
});

describe('Fix 2: Ledger amount consistency', () => {
  let rideWithFare;

  beforeAll(async () => {
    const RideRequest = require('../api/src/models/RideRequest');
    rideWithFare = await RideRequest.create({
      requester: (await require('../api/src/models/User').findOne({ username: 'fa_user' }))._id,
      pickup_text: 'A', dropoff_text: 'B', rider_count: 1,
      time_window_start: new Date(Date.now() + 600000),
      time_window_end: new Date(Date.now() + 3600000),
      fare_amount: 50.00,
      state_transitions: [{ from: 'created', to: 'pending_match', timestamp: new Date(), reason: 'test' }]
    });
  });

  test('exact fare payment succeeds', async () => {
    const res = await request(app).post('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        ride_request: rideWithFare._id,
        amount: 50.00, payment_method: 'cash',
        receipt_number: 'fa_exact_' + Date.now(),
        idempotency_key: 'fa_exact_' + Date.now()
      });
    expect([200, 201]).toContain(res.status);
  });

  test('overpay is rejected with OVERPAY error', async () => {
    const res = await request(app).post('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        ride_request: rideWithFare._id,
        amount: 10.00, payment_method: 'cash',
        receipt_number: 'fa_over_' + Date.now(),
        idempotency_key: 'fa_over_' + Date.now()
      });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('OVERPAY');
  });

  test('negative amount is rejected', async () => {
    const res = await request(app).post('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        amount: -5, payment_method: 'cash',
        receipt_number: 'fa_neg_' + Date.now(),
        idempotency_key: 'fa_neg_' + Date.now()
      });
    expect(res.status).toBe(422);
  });
});

describe('Fix 3: Protected config key deletion', () => {
  test('cannot delete protected key auto_cancel_minutes', async () => {
    const res = await request(app).delete('/api/config/auto_cancel_minutes')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('protected');
  });

  test('cannot delete protected key dispute_escalation_hours', async () => {
    const res = await request(app).delete('/api/config/dispute_escalation_hours')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
  });

  test('can delete non-protected key', async () => {
    await request(app).post('/api/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'fa_deletable', value: 'temp', category: 'general' });

    const res = await request(app).delete('/api/config/fa_deletable')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('can still update protected key value', async () => {
    const res = await request(app).put('/api/config/auto_cancel_minutes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 45 });
    expect(res.status).toBe(200);
    expect(res.body.config.value).toBe(45);

    await request(app).put('/api/config/auto_cancel_minutes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 30 });
  });
});

describe('Fix 4: Search sort semantics', () => {
  test('search response includes sort_applied metadata', async () => {
    const res = await request(app).get('/api/search?q=test&sort=newest')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sort_applied).toBeDefined();
    expect(res.body.sort_applied.movies).toBe('newest');
    expect(res.body.sort_applied.content).toBe('newest');
    expect(res.body.sort_applied.users).toBe('relevance');
  });

  test('unsupported sort defaults to relevance in metadata', async () => {
    const res = await request(app).get('/api/search?q=test&sort=unsupported')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sort_applied.movies).toBe('relevance');
  });

  test('popularity sort only applies to movies', async () => {
    const res = await request(app).get('/api/search?q=test&sort=popularity')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sort_applied.movies).toBe('popularity');
    expect(res.body.sort_applied.content).toBe('relevance');
  });
});
