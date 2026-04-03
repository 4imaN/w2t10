const mongoose = require('mongoose');

const stateTransitionSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reason: { type: String, default: null }
}, { _id: false });

const rideRequestSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pickup_text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  dropoff_text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  rider_count: {
    type: Number,
    required: true,
    min: 1,
    max: 6
  },
  time_window_start: {
    type: Date,
    required: true
  },
  time_window_end: {
    type: Date,
    required: true
  },
  vehicle_type: {
    type: String,
    enum: ['sedan', 'suv', 'van', 'shuttle'],
    default: 'sedan'
  },
  status: {
    type: String,
    enum: ['pending_match', 'accepted', 'in_progress', 'completed', 'canceled', 'in_dispute'],
    default: 'pending_match'
  },
  is_carpool: {
    type: Boolean,
    default: false
  },
  carpool_group_id: {
    type: String,
    default: null
  },
  dispatcher_notes: {
    type: String,
    default: null
  },
  assigned_dispatcher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  cancellation_requested: {
    type: Boolean,
    default: false
  },
  cancellation_approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  auto_cancel_at: {
    type: Date,
    default: null
  },
  state_transitions: [stateTransitionSchema],
  feedback: {
    rating: { type: Number, min: 1, max: 5, default: null },
    comment: { type: String, default: null }
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

rideRequestSchema.index({ status: 1, deleted_at: 1 });
rideRequestSchema.index({ requester: 1 });
rideRequestSchema.index({ auto_cancel_at: 1 });
rideRequestSchema.index({ created_at: -1 });

module.exports = mongoose.model('RideRequest', rideRequestSchema);
