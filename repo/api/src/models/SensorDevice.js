const mongoose = require('mongoose');

const sensorDeviceSchema = new mongoose.Schema({
  device_id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  secret_hash: {
    type: String,
    default: null
  },
  label: {
    type: String,
    trim: true,
    default: ''
  },
  unit: {
    type: String,
    default: ''
  },
  range_min: {
    type: Number,
    default: null
  },
  range_max: {
    type: Number,
    default: null
  },
  spike_threshold: {
    type: Number,
    default: null
  },
  drift_threshold: {
    type: Number,
    default: null
  },
  drift_window: {
    type: Number,
    default: 10  // number of readings to check for drift
  },
  sampling_rate_hz: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active'
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('SensorDevice', sensorDeviceSchema);
