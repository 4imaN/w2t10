const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let BatchSession;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-batch';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(MONGO_URI);
  BatchSession = require('../api/src/models/BatchSession');
});

afterAll(async () => {
  await BatchSession.deleteMany({ session_id: /^rt_test_/ });
  await mongoose.disconnect();
});

describe('Sensor Resumable Transfer — Durable Persistence', () => {
  test('BatchSession schema has required fields', () => {
    const paths = BatchSession.schema.paths;
    expect(paths.session_id).toBeDefined();
    expect(paths.device_id).toBeDefined();
    expect(paths.processed).toBeDefined();
    expect(paths.expires_at).toBeDefined();
  });

  test('BatchSession has TTL index on expires_at', () => {
    const indexes = BatchSession.schema.indexes();
    const ttlIndex = indexes.find(([fields]) => fields.expires_at === 1);
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex[1].expireAfterSeconds).toBe(0);
  });

  test('BatchSession has unique index on session_id', () => {
    const indexes = BatchSession.schema.indexes();
    const sessionIdx = indexes.find(([fields]) => fields.session_id === 1);
    expect(sessionIdx).toBeDefined();
    expect(sessionIdx[1].unique).toBe(true);
  });

  test('can create and retrieve a batch session', async () => {
    const sid = 'rt_test_' + Date.now();
    await BatchSession.create({
      session_id: sid,
      device_id: 'dev-1',
      processed: 5,
      expires_at: new Date(Date.now() + 3600000)
    });

    const found = await BatchSession.findOne({ session_id: sid });
    expect(found).toBeTruthy();
    expect(found.device_id).toBe('dev-1');
    expect(found.processed).toBe(5);
  });

  test('findOneAndUpdate with upsert creates or updates session', async () => {
    const sid = 'rt_test_upsert_' + Date.now();

    const created = await BatchSession.findOneAndUpdate(
      { session_id: sid },
      { session_id: sid, device_id: 'dev-2', processed: 0, expires_at: new Date(Date.now() + 3600000) },
      { upsert: true, new: true }
    );
    expect(created.processed).toBe(0);

    const updated = await BatchSession.findOneAndUpdate(
      { session_id: sid },
      { $set: { processed: 10 } },
      { new: true }
    );
    expect(updated.processed).toBe(10);
  });

  test('duplicate session_id is rejected', async () => {
    const sid = 'rt_test_dup_' + Date.now();
    await BatchSession.create({
      session_id: sid, device_id: 'dev-3', processed: 0,
      expires_at: new Date(Date.now() + 3600000)
    });

    await expect(
      BatchSession.create({
        session_id: sid, device_id: 'dev-4', processed: 0,
        expires_at: new Date(Date.now() + 3600000)
      })
    ).rejects.toThrow();
  });
});
