const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../api/src/app');
const User = require('../api/src/models/User');
const LedgerEntry = require('../api/src/models/LedgerEntry');
const Reconciliation = require('../api/src/models/Reconciliation');
const { hashPassword } = require('../api/src/utils/crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let dispatcherToken;
const today = new Date().toISOString().split('T')[0];

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  await User.deleteMany({});
  await LedgerEntry.deleteMany({});
  await Reconciliation.deleteMany({});

  await User.create({
    username: 'ledgerdisp', password_hash: await hashPassword('Dispatch123!'),
    role: 'dispatcher', display_name: 'Dispatcher'
  });

  const res = await request(app).post('/api/auth/login').send({ username: 'ledgerdisp', password: 'Dispatch123!' });
  dispatcherToken = res.body.token;
});

afterAll(async () => {
  await User.deleteMany({});
  await LedgerEntry.deleteMany({});
  await Reconciliation.deleteMany({});
  await mongoose.disconnect();
});

describe('Ledger API', () => {
  const idempotencyKey = 'PAY-TEST-001';

  test('POST /api/ledger/entries — record payment', async () => {
    const res = await request(app)
      .post('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        amount: 25.50,
        payment_method: 'cash',
        receipt_number: 'REC-001',
        idempotency_key: idempotencyKey
      });
    expect(res.status).toBe(201);
    expect(res.body.entry.amount).toBe(25.50);
    expect(res.body.entry.status).toBe('posted');
  });

  test('POST /api/ledger/entries — idempotency prevents duplicate', async () => {
    const res = await request(app)
      .post('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        amount: 25.50,
        payment_method: 'cash',
        receipt_number: 'REC-001',
        idempotency_key: idempotencyKey
      });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Duplicate');
  });

  test('POST /api/ledger/entries — second entry', async () => {
    const res = await request(app)
      .post('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        amount: 15.00,
        payment_method: 'card_on_file',
        receipt_number: 'REC-002',
        idempotency_key: 'PAY-TEST-002'
      });
    expect(res.status).toBe(201);
  });

  test('GET /api/ledger/entries — list entries', async () => {
    const res = await request(app)
      .get('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(2);
  });

  test('GET /api/ledger/reconciliation/:date — view reconciliation', async () => {
    const res = await request(app)
      .get(`/api/ledger/reconciliation/${today}`)
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.reconciliation.total_amount).toBe(40.50);
    expect(res.body.reconciliation.entry_count).toBe(2);
    expect(res.body.reconciliation.locked).toBe(false);
  });

  test('POST /api/ledger/reconciliation/:date/close — close day', async () => {
    const res = await request(app)
      .post(`/api/ledger/reconciliation/${today}/close`)
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.reconciliation.locked).toBe(true);
  });

  test('POST /api/ledger/entries — reject entry after day close', async () => {
    const res = await request(app)
      .post('/api/ledger/entries')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        amount: 10.00,
        payment_method: 'cash',
        receipt_number: 'REC-003',
        idempotency_key: 'PAY-TEST-003',
        ledger_date: today
      });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('closed');
  });
});
