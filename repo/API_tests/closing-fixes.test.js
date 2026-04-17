const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app, adminToken, dispatcherToken, userToken;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-closing';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;
  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const ConfigDictionary = require('../api/src/models/ConfigDictionary');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.deleteMany({ username: /^cf_/ });
  await User.create({ username: 'cf_admin', password_hash: await hashPassword('Test1234!'), role: 'administrator', display_name: 'CF Admin' });
  await User.create({ username: 'cf_disp', password_hash: await hashPassword('Test1234!'), role: 'dispatcher', display_name: 'CF Disp' });
  await User.create({ username: 'cf_user', password_hash: await hashPassword('Test1234!'), role: 'regular_user', display_name: 'CF User' });

  await ConfigDictionary.findOneAndUpdate({ key: 'auto_cancel_minutes' }, { key: 'auto_cancel_minutes', value: 30, category: 'thresholds' }, { upsert: true });
  await ConfigDictionary.findOneAndUpdate({ key: 'free_cancel_window_minutes' }, { key: 'free_cancel_window_minutes', value: 5, category: 'thresholds' }, { upsert: true });
  await ConfigDictionary.findOneAndUpdate({ key: 'min_ride_advance_minutes' }, { key: 'min_ride_advance_minutes', value: 5, category: 'thresholds' }, { upsert: true });

  let res;
  res = await request(app).post('/api/auth/login').send({ username: 'cf_admin', password: 'Test1234!' });
  adminToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'cf_disp', password: 'Test1234!' });
  dispatcherToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'cf_user', password: 'Test1234!' });
  userToken = res.body.token;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  await User.deleteMany({ username: /^cf_/ });
  await mongoose.disconnect();
});

describe('Ledger strict amount invariants', () => {
  let rideId;
  const ts = Date.now();

  beforeAll(async () => {
    const RideRequest = require('../api/src/models/RideRequest');
    const user = await require('../api/src/models/User').findOne({ username: 'cf_user' });
    const ride = await RideRequest.create({
      requester: user._id, pickup_text: 'A', dropoff_text: 'B', rider_count: 1,
      time_window_start: new Date(Date.now() + 600000),
      time_window_end: new Date(Date.now() + 3600000),
      fare_amount: 100.00,
      state_transitions: [{ from: 'created', to: 'pending_match', timestamp: new Date(), reason: 'test' }]
    });
    rideId = ride._id;
  });

  test('exact fare payment succeeds', async () => {
    const res = await request(app).post('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        ride_request: rideId, amount: 60, payment_method: 'cash',
        receipt_number: 'cf_p1_' + ts, idempotency_key: 'cf_p1_' + ts
      });
    expect(res.status).toBe(201);
  });

  test('partial payment (second installment) succeeds', async () => {
    const res = await request(app).post('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        ride_request: rideId, amount: 40, payment_method: 'card_on_file',
        receipt_number: 'cf_p2_' + ts, idempotency_key: 'cf_p2_' + ts
      });
    expect(res.status).toBe(201);
  });

  test('overpay after full settlement is rejected', async () => {
    const res = await request(app).post('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        ride_request: rideId, amount: 1, payment_method: 'cash',
        receipt_number: 'cf_over_' + ts, idempotency_key: 'cf_over_' + ts
      });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('OVERPAY');
  });

  test('zero amount is rejected', async () => {
    const res = await request(app).post('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        amount: 0, payment_method: 'cash',
        receipt_number: 'cf_zero_' + ts, idempotency_key: 'cf_zero_' + ts
      });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('greater than zero');
  });

  test('ride without fare_amount blocks payment', async () => {
    const RideRequest = require('../api/src/models/RideRequest');
    const user = await require('../api/src/models/User').findOne({ username: 'cf_user' });
    const noFareRide = await RideRequest.create({
      requester: user._id, pickup_text: 'X', dropoff_text: 'Y', rider_count: 1,
      time_window_start: new Date(Date.now() + 600000),
      time_window_end: new Date(Date.now() + 3600000),
      state_transitions: [{ from: 'created', to: 'pending_match', timestamp: new Date(), reason: 'test' }]
    });

    const res = await request(app).post('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        ride_request: noFareRide._id, amount: 10, payment_method: 'cash',
        receipt_number: 'cf_nofare_' + ts, idempotency_key: 'cf_nofare_' + ts
      });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('FARE_MISSING');
  });

  test('getRideSettlement reports correct status', async () => {
    const ledgerService = require('../api/src/services/ledger.service');
    const settlement = await ledgerService.getRideSettlement(rideId);
    expect(settlement.status).toBe('settled');
    expect(settlement.total_paid).toBe(100);
    expect(settlement.fare_amount).toBe(100);
  });
});

describe('Search sort validation', () => {
  test('invalid sort for typed user query returns 422', async () => {
    const res = await request(app).get('/api/search?q=test&type=user&sort=popularity')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('not supported');
  });

  test('valid sort for movie type succeeds', async () => {
    const res = await request(app).get('/api/search?q=test&type=movie&sort=popularity')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sort_applied.movies).toBe('popularity');
  });

  test('newest sort applies to both movies and content', async () => {
    const res = await request(app).get('/api/search?q=test&sort=newest')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sort_applied.movies).toBe('newest');
    expect(res.body.sort_applied.content).toBe('newest');
  });

  test('untyped query with any sort succeeds (no type constraint)', async () => {
    const res = await request(app).get('/api/search?q=test&sort=rating')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
  });

  test('invalid sort for content type returns 422', async () => {
    const res = await request(app).get('/api/search?q=test&type=content&sort=popularity')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(422);
  });
});

describe('Import file cleanup verification', () => {
  test('upload creates no persistent file in imports dir', async () => {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const importsDir = path.join(uploadsDir, 'imports');
    const before = fs.existsSync(importsDir)
      ? fs.readdirSync(importsDir).filter(f => f !== '.gitkeep')
      : [];

    const tmpFile = path.join(uploadsDir, 'cf-test.json');
    fs.writeFileSync(tmpFile, JSON.stringify([{ title: 'Cleanup Verify' }]));

    await request(app).post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', tmpFile);

    const after = fs.existsSync(importsDir)
      ? fs.readdirSync(importsDir).filter(f => f !== '.gitkeep')
      : [];
    expect(after.length).toBe(before.length);

    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  test('failed validation leaves no orphan file', async () => {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const importsDir = path.join(uploadsDir, 'imports');
    const before = fs.existsSync(importsDir)
      ? fs.readdirSync(importsDir).filter(f => f !== '.gitkeep')
      : [];

    const tmpFile = path.join(uploadsDir, 'cf-bad.xml');
    fs.writeFileSync(tmpFile, '<bad/>');

    await request(app).post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', tmpFile);

    const after = fs.existsSync(importsDir)
      ? fs.readdirSync(importsDir).filter(f => f !== '.gitkeep')
      : [];
    expect(after.length).toBe(before.length);

    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });
});

describe('Orphan import cleanup job', () => {
  test('removes files older than MAX_AGE_MS from imports dir', async () => {
    const { runImportCleanup, IMPORT_DIR, MAX_AGE_MS } = require('../api/src/jobs/import-cleanup.job');

    fs.mkdirSync(IMPORT_DIR, { recursive: true });
    const orphanPath = path.join(IMPORT_DIR, 'orphan-test-' + Date.now() + '.json');
    fs.writeFileSync(orphanPath, '{}');

    const oldTime = new Date(Date.now() - MAX_AGE_MS - 60000);
    fs.utimesSync(orphanPath, oldTime, oldTime);

    await runImportCleanup();

    expect(fs.existsSync(orphanPath)).toBe(false);
  });

  test('does not remove recent files', async () => {
    const { runImportCleanup, IMPORT_DIR } = require('../api/src/jobs/import-cleanup.job');

    fs.mkdirSync(IMPORT_DIR, { recursive: true });
    const recentPath = path.join(IMPORT_DIR, 'recent-test-' + Date.now() + '.json');
    fs.writeFileSync(recentPath, '{}');

    await runImportCleanup();

    expect(fs.existsSync(recentPath)).toBe(true);
    fs.unlinkSync(recentPath);
  });

  test('does not remove .gitkeep', async () => {
    const { runImportCleanup, IMPORT_DIR } = require('../api/src/jobs/import-cleanup.job');
    const gitkeepPath = path.join(IMPORT_DIR, '.gitkeep');
    if (!fs.existsSync(gitkeepPath)) fs.writeFileSync(gitkeepPath, '');

    await runImportCleanup();

    expect(fs.existsSync(gitkeepPath)).toBe(true);
  });
});
