const mongoose = require('mongoose');

const extensionClientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  api_key_prefix: {
    type: String,
    required: true,
    index: true
  },
  api_key_hash: {
    type: String,
    required: true
  },
  permissions: [{
    resource: { type: String, required: true },
    access: { type: String, enum: ['read', 'read_write'], default: 'read' },
    allowed_statuses: [{ type: String }],
    max_age_days: { type: Number, default: null }
  }],
  rate_limit: {
    type: Number,
    default: 120
  },
  rate_limit_hits: [{
    timestamp: { type: Date, required: true }
  }],
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  last_used_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('ExtensionClient', extensionClientSchema);
