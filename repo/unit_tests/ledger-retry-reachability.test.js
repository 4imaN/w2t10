const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let ledgerService, LedgerEntry;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-ledger';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(MONGO_URI);
  ledgerService = require('../api/src/services/ledger.service');
  LedgerEntry = require('../api/src/models/LedgerEntry');
});

afterAll(async () => {
  await LedgerEntry.deleteMany({ receipt_number: /^lr_test_/ });
  await mongoose.disconnect();
});

describe('Ledger Retry Reachability', () => {
  const userId = new mongoose.Types.ObjectId();

  test('entries are created with pending status, then posted', async () => {
    const result = await ledgerService.recordPayment({
      amount: 10,
      payment_method: 'cash',
      receipt_number: 'lr_test_pending_' + Date.now(),
      idempotency_key: 'lr_idem_' + Date.now(),
    }, userId);

    expect(['pending', 'posted']).toContain(result.entry.status);
    if (!result.posting_error) {
      expect(result.entry.status).toBe('posted');
    }
  });

  test('duplicate receipt for same day causes posting failure', async () => {
    const receiptNum = 'lr_test_dup_' + Date.now();
    const day = new Date().toISOString().split('T')[0];

    await ledgerService.recordPayment({
      amount: 5, payment_method: 'cash',
      receipt_number: receiptNum,
      idempotency_key: 'lr_dup1_' + Date.now(),
      ledger_date: day,
    }, userId);

    const result2 = await ledgerService.recordPayment({
      amount: 5, payment_method: 'cash',
      receipt_number: receiptNum,
      idempotency_key: 'lr_dup2_' + Date.now(),
      ledger_date: day,
    }, userId);

    expect(result2.posting_error).toBeTruthy();
    expect(result2.posting_error).toContain('Duplicate receipt number');
    expect(result2.entry.status).toBe('failed');
  });

  test('idempotency key returns existing entry without creating new one', async () => {
    const idemKey = 'lr_idem_dedup_' + Date.now();
    const result1 = await ledgerService.recordPayment({
      amount: 7, payment_method: 'cash',
      receipt_number: 'lr_test_idem_' + Date.now(),
      idempotency_key: idemKey,
    }, userId);
    expect(result1.duplicate).toBe(false);

    const result2 = await ledgerService.recordPayment({
      amount: 99, payment_method: 'card_on_file',
      receipt_number: 'lr_test_idem_other',
      idempotency_key: idemKey,
    }, userId);
    expect(result2.duplicate).toBe(true);
    expect(result2.entry._id.toString()).toBe(result1.entry._id.toString());
  });

  test('retryFailedEntries retries failed entries via attemptPosting', async () => {
    const entry = await ledgerService.createFailedEntry({
      amount: 3, payment_method: 'cash',
      receipt_number: 'lr_test_retry_' + Date.now(),
      idempotency_key: 'lr_retry_' + Date.now(),
    }, userId);
    expect(entry.status).toBe('failed');

    await LedgerEntry.updateOne(
      { _id: entry._id },
      { $set: { created_at: new Date(Date.now() - 120000), last_retry_at: new Date(Date.now() - 60000) } }
    );

    const retried = await ledgerService.retryFailedEntries();
    expect(retried).toBeGreaterThanOrEqual(1);

    const updated = await LedgerEntry.findById(entry._id);
    expect(updated.status).toBe('posted');
  });
});
