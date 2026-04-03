const mongoose = require('mongoose');

const extensionClientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  api_key_hash: {
    type: String,
    required: true
  },
  permissions: [{
    resource: { type: String, required: true },
    access: { type: String, enum: ['read', 'read_write'], default: 'read' }
  }],
  rate_limit: {
    type: Number,
    default: 120  // requests per minute
  },
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
