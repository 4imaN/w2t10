const LedgerEntry = require('../models/LedgerEntry');
const Reconciliation = require('../models/Reconciliation');
const RideRequest = require('../models/RideRequest');
const { encrypt } = require('../utils/crypto');
const { getConfig } = require('./config.service');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors');

function todayDate() {
  return new Date().toISOString().split('T')[0];
}

async function attemptPosting(entry) {
  try {
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
  const ledgerDate = data.ledger_date || todayDate();
  const recon = await Reconciliation.findOne({ ledger_date: ledgerDate, locked: true });
  if (recon) {
    throw new ValidationError(`Ledger for ${ledgerDate} is closed. Cannot add entries.`);
  }

  const existing = await LedgerEntry.findOne({ idempotency_key: data.idempotency_key });
  if (existing) {
    return { entry: existing, duplicate: true };
  }

  if (data.amount < 0) {
    throw new ValidationError('Payment amount must be non-negative');
  }
  if (data.amount === 0) {
    throw new ValidationError('Payment amount must be greater than zero');
  }

  if (data.ride_request) {
    const ride = await RideRequest.findById(data.ride_request);
    if (!ride) throw new NotFoundError('Ride request');

    if (ride.fare_amount === null || ride.fare_amount === undefined) {
      throw new ValidationError(
        'FARE_MISSING: ride does not have a fare_amount set. Set fare before recording payment.'
      );
    }

    const existingEntries = await LedgerEntry.find({
      ride_request: data.ride_request,
      status: { $in: ['posted', 'reconciled'] },
      deleted_at: null
    });
    const existingTotal = existingEntries.reduce((sum, e) => sum + e.amount, 0);
    const newTotal = existingTotal + data.amount;

    if (newTotal > ride.fare_amount) {
      throw new ValidationError(
        `OVERPAY: total $${newTotal.toFixed(2)} would exceed fare $${ride.fare_amount.toFixed(2)}. ` +
        `Existing: $${existingTotal.toFixed(2)}, attempted: $${data.amount.toFixed(2)}.`
      );
    }
  }

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

  const postResult = await attemptPosting(entry);

  return { entry: postResult.entry, duplicate: false, posting_error: postResult.error };
}

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
    const backoffMs = Math.pow(4, entry.retry_count) * 1000;
    const lastAttempt = entry.last_retry_at || entry.created_at;
    const nextRetryAfter = new Date(lastAttempt.getTime() + backoffMs);

    if (new Date() < nextRetryAfter) continue;

    entry.retry_count += 1;

    try {
      const result = await attemptPosting(entry);
      if (result.error === null) retried++;
    } catch {
      await entry.save();
    }
  }

  return retried;
}

async function getRideSettlement(rideId) {
  const ride = await RideRequest.findById(rideId);
  if (!ride) throw new NotFoundError('Ride request');

  const entries = await LedgerEntry.find({
    ride_request: rideId,
    status: { $in: ['posted', 'reconciled'] },
    deleted_at: null
  });
  const totalPaid = entries.reduce((sum, e) => sum + e.amount, 0);
  const fare = ride.fare_amount;

  let status = 'no_fare';
  if (fare !== null && fare !== undefined) {
    if (totalPaid === 0) status = 'unpaid';
    else if (totalPaid < fare) status = 'underpaid';
    else if (totalPaid === fare) status = 'settled';
    else status = 'overpaid';
  }

  return { ride_id: rideId, fare_amount: fare, total_paid: totalPaid, entry_count: entries.length, status };
}

module.exports = {
  recordPayment,
  createFailedEntry,
  getLedgerEntries,
  getReconciliation,
  closeDayReconciliation,
  retryFailedEntries,
  getRideSettlement
};
