const mongoose = require('mongoose');

const configDictionarySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['statuses', 'tags', 'priority', 'thresholds', 'general', 'vehicle_types', 'ratings', 'sensitive_words']
  },
  description: {
    type: String,
    default: ''
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('ConfigDictionary', configDictionarySchema);
