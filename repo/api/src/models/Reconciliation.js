const mongoose = require('mongoose');

const reconciliationSchema = new mongoose.Schema({
  ledger_date: {
    type: String,  // YYYY-MM-DD
    required: true,
    unique: true
  },
  entries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LedgerEntry'
  }],
  total_amount: {
    type: Number,
    default: 0
  },
  total_cash: {
    type: Number,
    default: 0
  },
  total_card: {
    type: Number,
    default: 0
  },
  entry_count: {
    type: Number,
    default: 0
  },
  locked: {
    type: Boolean,
    default: false
  },
  closed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  closed_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

reconciliationSchema.index({ ledger_date: 1 }, { unique: true });

module.exports = mongoose.model('Reconciliation', reconciliationSchema);
