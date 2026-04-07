const mongoose = require('mongoose');

const sensorReadingSchema = new mongoose.Schema({
  device_id: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    required: true
  },
  value: {
    type: Number,
    default: null
  },
  unit: {
    type: String,
    default: ''
  },
  is_raw: {
    type: Boolean,
    default: true
  },
  is_cleaned: {
    type: Boolean,
    default: false
  },
  outlier_flags: {
    range: { type: Boolean, default: false },
    spike: { type: Boolean, default: false },
    drift: { type: Boolean, default: false },
    time_drift: { type: Boolean, default: false }
  },
  time_drift_seconds: {
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

// Unique per device + timestamp + version type (raw vs cleaned can coexist)
sensorReadingSchema.index({ device_id: 1, timestamp: 1, is_raw: 1 }, { unique: true });
sensorReadingSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
sensorReadingSchema.index({ device_id: 1, created_at: -1 });

module.exports = mongoose.model('SensorReading', sensorReadingSchema);
