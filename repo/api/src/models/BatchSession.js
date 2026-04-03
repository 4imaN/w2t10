const mongoose = require('mongoose');

const batchSessionSchema = new mongoose.Schema({
  session_id: {
    type: String,
    required: true,
    unique: true
  },
  device_id: {
    type: String,
    required: true
  },
  processed: {
    type: Number,
    default: 0
  },
  expires_at: {
    type: Date,
    required: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

batchSessionSchema.index({ session_id: 1 }, { unique: true });
batchSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('BatchSession', batchSessionSchema);
