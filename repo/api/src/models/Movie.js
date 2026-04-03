const mongoose = require('mongoose');

const mediaRefSchema = new mongoose.Schema({
  filename: String,
  original_name: String,
  mimetype: String,
  size: Number,
  fingerprint: String, // SHA-256 hash of file content
  path: String
}, { _id: false });

const revisionSnapshotSchema = new mongoose.Schema({
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  timestamp: { type: Date, default: Date.now },
  changed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  change_type: {
    type: String,
    enum: ['create', 'edit', 'import_merge', 'unpublish', 'republish']
  }
}, { _id: true });

const movieSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  description: {
    type: String,
    default: '',
    maxlength: 5000
  },
  categories: [{
    type: String,
    trim: true
  }],
  tags: [{
    type: String,
    trim: true
  }],
  mpaa_rating: {
    type: String,
    enum: ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'],
    default: 'NR'
  },
  release_date: {
    type: Date,
    default: null
  },
  poster: {
    type: mediaRefSchema,
    default: null
  },
  stills: [mediaRefSchema],
  is_published: {
    type: Boolean,
    default: true
  },
  popularity_score: {
    type: Number,
    default: 0
  },
  revisions: [revisionSnapshotSchema],
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

movieSchema.index({ title: 'text', description: 'text', tags: 'text' });
movieSchema.index({ is_published: 1, deleted_at: 1 });
movieSchema.index({ categories: 1 });
movieSchema.index({ mpaa_rating: 1 });
movieSchema.index({ release_date: -1 });
movieSchema.index({ popularity_score: -1 });

module.exports = mongoose.model('Movie', movieSchema);
