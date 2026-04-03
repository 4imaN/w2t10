const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema({
  ride_request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RideRequest',
    required: true
  },
  initiated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reason: {
    type: String,
    required: true,
    enum: ['no_show', 'wrong_route', 'fare_dispute', 'service_complaint', 'other']
  },
  detail_encrypted: {
    type: String,
    default: null
  },
  assigned_dispatcher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolution: {
    type: String,
    enum: ['resolved_in_favor_of_rider', 'resolved_in_favor_of_driver', 'partial_refund', 'no_action', 'escalated', null],
    default: null
  },
  resolution_notes_encrypted: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['open', 'investigating', 'resolved', 'escalated'],
    default: 'open'
  },
  escalation_deadline: {
    type: Date,
    default: null
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

disputeSchema.index({ ride_request: 1 });
disputeSchema.index({ status: 1 });
disputeSchema.index({ assigned_dispatcher: 1 });
disputeSchema.index({ escalation_deadline: 1 });

module.exports = mongoose.model('Dispute', disputeSchema);
