const LedgerEntry = require('../models/LedgerEntry');
const Reconciliation = require('../models/Reconciliation');
const RideRequest = require('../models/RideRequest');
const { encrypt } = require('../utils/crypto');
const { getConfig } = require('./config.service');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

function todayDate() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Attempt to post a ledger entry. This is the real posting step that can fail.
 * For the local ledger, posting validates receipt uniqueness per day and marks as posted.
 * Failures (e.g., duplicate receipt for the day) leave the entry in 'failed' for retry.
 */
async function attemptPosting(entry) {
  try {
    // Validate: no duplicate receipt_number for the same ledger_date (besides this entry)
    const dupReceipt = await LedgerEntry.findOne({
      receipt_number: entry.receipt_number,
      ledger_date: entry.ledger_date,
      _id: { $ne: entry._id },
      status: { $in: ['posted', 'reconciled'] },
      deleted_at: null
    });
    if (dupReceipt) {
      throw new Error(`Duplicate receipt number '${entry.receipt_number}' for ${entry.ledger_date}`);
    }

    entry.status = 'posted';
    await entry.save();
    return { entry, error: null };
  } catch (err) {
    entry.status = 'failed';
    entry.last_retry_at = new Date();
    await entry.save();
    return { entry, error: err.message };
  }
}

async function recordPayment(data, userId) {
  // Check if day is closed
  const ledgerDate = data.ledger_date || todayDate();
  const recon = await Reconciliation.findOne({ ledger_date: ledgerDate, locked: true });
  if (recon) {
    throw new ValidationError(`Ledger for ${ledgerDate} is closed. Cannot add entries.`);
  }

  // Idempotency check
  const existing = await LedgerEntry.findOne({ idempotency_key: data.idempotency_key });
  if (existing) {
    return { entry: existing, duplicate: true };
  }

  // Amount consistency: if linked to a ride, validate total payments don't exceed
  // a reasonable bound (entries for same ride should sum consistently)
  if (data.ride_request) {
    const ride = await RideRequest.findById(data.ride_request);
    if (!ride) throw new NotFoundError('Ride request');

    const existingEntries = await LedgerEntry.find({
      ride_request: data.ride_request,
      status: { $in: ['posted', 'reconciled'] },
      deleted_at: null
    });
    const existingTotal = existingEntries.reduce((sum, e) => sum + e.amount, 0);

    if (data.amount < 0) {
      throw new ValidationError('Payment amount must be non-negative');
    }
    // Flag if total for this ride would exceed a configurable max per-ride amount
    const maxRideAmount = await getConfig('max_ride_payment_amount', 500);
    if (existingTotal + data.amount > maxRideAmount) {
      throw new ValidationError(
        `Total payments for this ride would be $${(existingTotal + data.amount).toFixed(2)}, ` +
        `exceeding the maximum of $${maxRideAmount}. Existing total: $${existingTotal.toFixed(2)}.`
      );
    }
  }

  // Create the entry as 'pending' first
  const entry = await LedgerEntry.create({
    ride_request: data.ride_request || null,
    amount: data.amount,
    payment_method: data.payment_method,
    receipt_number: data.receipt_number,
    idempotency_key: data.idempotency_key,
    status: 'pending',
    ledger_date: ledgerDate,
    reference_encrypted: data.reference ? encrypt(data.reference) : null,
    recorded_by: userId,
    retry_count: 0,
    last_retry_at: null
  });

  // Attempt to post the entry (the real posting step)
  const postResult = await attemptPosting(entry);

  return { entry: postResult.entry, duplicate: false, posting_error: postResult.error };
}

// Explicitly create a failed entry (for testing the retry path)
async function createFailedEntry(data, userId) {
  const ledgerDate = data.ledger_date || todayDate();

  const entry = await LedgerEntry.create({
    ride_request: data.ride_request || null,
    amount: data.amount,
    payment_method: data.payment_method,
    receipt_number: data.receipt_number,
    idempotency_key: data.idempotency_key,
    status: 'failed',
    ledger_date: ledgerDate,
    reference_encrypted: null,
    recorded_by: userId,
    retry_count: 0,
    last_retry_at: null
  });

  return entry;
}

async function getLedgerEntries(filters = {}, page = 1, limit = 50) {
  const query = { deleted_at: null };
  if (filters.ledger_date) query.ledger_date = filters.ledger_date;
  if (filters.status) query.status = filters.status;
  if (filters.payment_method) query.payment_method = filters.payment_method;
  if (filters.ride_request) query.ride_request = filters.ride_request;

  const total = await LedgerEntry.countDocuments(query);
  const entries = await LedgerEntry.find(query)
    .populate('recorded_by', 'username display_name')
    .populate('ride_request', 'pickup_text dropoff_text')
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return { entries, total, page, pages: Math.ceil(total / limit) };
}

async function getReconciliation(ledgerDate) {
  let recon = await Reconciliation.findOne({ ledger_date: ledgerDate })
    .populate('closed_by', 'username display_name');

  if (!recon) {
    const entries = await LedgerEntry.find({ ledger_date: ledgerDate, deleted_at: null, status: 'posted' });
    const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);
    const totalCash = entries.filter(e => e.payment_method === 'cash').reduce((sum, e) => sum + e.amount, 0);
    const totalCard = entries.filter(e => e.payment_method === 'card_on_file').reduce((sum, e) => sum + e.amount, 0);

    return {
      ledger_date: ledgerDate,
      entries: entries.map(e => e._id),
      total_amount: totalAmount,
      total_cash: totalCash,
      total_card: totalCard,
      entry_count: entries.length,
      locked: false,
      closed_by: null,
      closed_at: null
    };
  }

  return recon;
}

async function closeDayReconciliation(ledgerDate, userId) {
  const existing = await Reconciliation.findOne({ ledger_date: ledgerDate });
  if (existing && existing.locked) {
    throw new ValidationError(`Day ${ledgerDate} is already closed`);
  }

  const entries = await LedgerEntry.find({ ledger_date: ledgerDate, deleted_at: null, status: 'posted' });
  const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);
  const totalCash = entries.filter(e => e.payment_method === 'cash').reduce((sum, e) => sum + e.amount, 0);
  const totalCard = entries.filter(e => e.payment_method === 'card_on_file').reduce((sum, e) => sum + e.amount, 0);

  const recon = await Reconciliation.findOneAndUpdate(
    { ledger_date: ledgerDate },
    {
      ledger_date: ledgerDate,
      entries: entries.map(e => e._id),
      total_amount: totalAmount,
      total_cash: totalCash,
      total_card: totalCard,
      entry_count: entries.length,
      locked: true,
      closed_by: userId,
      closed_at: new Date()
    },
    { upsert: true, new: true }
  );

  await LedgerEntry.updateMany(
    { ledger_date: ledgerDate, deleted_at: null },
    { day_closed: true }
  );

  return recon;
}

async function retryFailedEntries() {
  const maxRetries = await getConfig('ledger_max_retries', 3);
  const entries = await LedgerEntry.find({
    status: 'failed',
    retry_count: { $lt: maxRetries },
    day_closed: false,
    deleted_at: null
  });

  let retried = 0;
  for (const entry of entries) {
    // Exponential backoff: 1s, 4s, 16s
    const backoffMs = Math.pow(4, entry.retry_count) * 1000;
    const lastAttempt = entry.last_retry_at || entry.created_at;
    const nextRetryAfter = new Date(lastAttempt.getTime() + backoffMs);

    if (new Date() < nextRetryAfter) continue;

    entry.retry_count += 1;

    try {
      const result = await attemptPosting(entry);
      if (result.error === null) retried++;
    } catch {
      // Still failed — keep as failed for next retry cycle
      await entry.save();
    }
  }

  return retried;
}

module.exports = {
  recordPayment,
  createFailedEntry,
  getLedgerEntries,
  getReconciliation,
  closeDayReconciliation,
  retryFailedEntries
};
