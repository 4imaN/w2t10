const mongoose = require('mongoose');

const userInteractionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  entity_type: {
    type: String,
    required: true,
    enum: ['movie', 'content', 'search', 'ride']
  },
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  action_type: {
    type: String,
    required: true,
    enum: ['view', 'search', 'read', 'request', 'bookmark']
  },
  search_query: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

userInteractionSchema.index({ user_id: 1, timestamp: -1 });
userInteractionSchema.index({ entity_type: 1, entity_id: 1, timestamp: -1 });
userInteractionSchema.index({ timestamp: -1 });

module.exports = mongoose.model('UserInteraction', userInteractionSchema);
