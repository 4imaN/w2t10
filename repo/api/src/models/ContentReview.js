const mongoose = require('mongoose');

const contentReviewSchema = new mongoose.Schema({
  content_item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContentItem',
    required: true
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  step: {
    type: Number,
    required: true,
    enum: [1, 2]
  },
  decision: {
    type: String,
    required: true,
    enum: ['approved', 'rejected']
  },
  rejection_reason: {
    type: String,
    default: null,
    maxlength: 2000
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

contentReviewSchema.index({ content_item: 1, step: 1 });
contentReviewSchema.index({ reviewer: 1 });

module.exports = mongoose.model('ContentReview', contentReviewSchema);
