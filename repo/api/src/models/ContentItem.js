const mongoose = require('mongoose');

const contentRevisionSchema = new mongoose.Schema({
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  timestamp: { type: Date, default: Date.now },
  changed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  change_type: {
    type: String,
    enum: ['create', 'edit', 'submit_review', 'revision', 'publish', 'unpublish', 'schedule']
  }
}, { _id: true });

const contentItemSchema = new mongoose.Schema({
  content_type: {
    type: String,
    required: true,
    enum: ['article', 'gallery', 'video', 'event']
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  body: {
    type: String,
    default: ''
  },
  media_refs: [{
    filename: String,
    original_name: String,
    mimetype: String,
    size: Number,
    path: String
  }],
  gallery_items: [{
    media_url: { type: String },
    caption: { type: String, default: '' },
    sort_order: { type: Number, default: 0 }
  }],
  video_url: { type: String, default: null },
  video_duration_seconds: { type: Number, default: null },
  video_format: { type: String, default: null },
  event_date: { type: Date, default: null },
  event_end_date: { type: Date, default: null },
  event_location: { type: String, default: null },
  event_capacity: { type: Number, default: null },
  status: {
    type: String,
    enum: ['draft', 'in_review_1', 'in_review_2', 'scheduled', 'published', 'unpublished'],
    default: 'draft'
  },
  scheduled_publish_date: {
    type: Date,
    default: null
  },
  sensitive_words_acknowledged: {
    type: Boolean,
    default: false
  },
  flagged_words: [{
    type: String
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  revisions: [contentRevisionSchema],
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

contentItemSchema.pre('save', function(next) {
  if (!this.isNew && this.isModified('revisions')) {
    const original = this._original_revisions_count;
    if (original !== undefined && this.revisions.length < original) {
      return next(new Error('IMMUTABLE_LOG: Cannot remove revision entries'));
    }
  }
  next();
});

contentItemSchema.post('init', function(doc) {
  doc._original_revisions_count = doc.revisions ? doc.revisions.length : 0;
});

contentItemSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function(next) {
  const update = this.getUpdate();
  const updateStr = JSON.stringify(update);
  if (updateStr.includes('$pull') && updateStr.includes('revisions') ||
      updateStr.includes('$set') && updateStr.includes('revisions') && !updateStr.includes('$push')) {
    return next(new Error('IMMUTABLE_LOG: Cannot modify or remove revision entries'));
  }
  next();
});

contentItemSchema.index({ title: 'text', body: 'text' });
contentItemSchema.index({ status: 1, deleted_at: 1 });
contentItemSchema.index({ content_type: 1 });
contentItemSchema.index({ author: 1 });
contentItemSchema.index({ scheduled_publish_date: 1 });

module.exports = mongoose.model('ContentItem', contentItemSchema);
