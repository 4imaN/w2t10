const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
  ride_request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RideRequest',
    default: null
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  payment_method: {
    type: String,
    required: true,
    enum: ['cash', 'card_on_file']
  },
  receipt_number: {
    type: String,
    required: true,
    trim: true
  },
  idempotency_key: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['pending', 'posted', 'failed', 'reconciled'],
    default: 'pending'
  },
  retry_count: {
    type: Number,
    default: 0,
    max: 3
  },
  last_retry_at: {
    type: Date,
    default: null
  },
  day_closed: {
    type: Boolean,
    default: false
  },
  ledger_date: {
    type: String,  // YYYY-MM-DD format for day grouping
    required: true
  },
  reference_encrypted: {
    type: String,
    default: null
  },
  recorded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

ledgerEntrySchema.index({ idempotency_key: 1 }, { unique: true });
ledgerEntrySchema.index({ ledger_date: 1, status: 1 });
ledgerEntrySchema.index({ ride_request: 1 });
ledgerEntrySchema.index({ status: 1, retry_count: 1 });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
