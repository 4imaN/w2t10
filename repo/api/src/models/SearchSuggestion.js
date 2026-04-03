const mongoose = require('mongoose');

const searchSuggestionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['movie', 'content', 'user', 'tag', 'query']
  },
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  score: {
    type: Number,
    default: 0
  }
});

searchSuggestionSchema.index({ text: 'text' });
searchSuggestionSchema.index({ type: 1, score: -1 });

module.exports = mongoose.model('SearchSuggestion', searchSuggestionSchema);
