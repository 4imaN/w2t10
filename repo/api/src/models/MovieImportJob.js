const mongoose = require('mongoose');

const conflictFieldSchema = new mongoose.Schema({
  field: { type: String, required: true },
  existing_value: { type: mongoose.Schema.Types.Mixed },
  imported_value: { type: mongoose.Schema.Types.Mixed },
  resolution: {
    type: String,
    enum: ['keep_existing', 'use_imported', null],
    default: null
  }
}, { _id: false });

const importRecordSchema = new mongoose.Schema({
  imported_data: { type: mongoose.Schema.Types.Mixed, required: true },
  matched_movie_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Movie',
    default: null
  },
  conflicts: [conflictFieldSchema],
  status: {
    type: String,
    enum: ['pending', 'conflict', 'resolved', 'imported', 'skipped'],
    default: 'pending'
  }
}, { _id: true });

const movieImportJobSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  uploaded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  records: [importRecordSchema],
  total_records: {
    type: Number,
    default: 0
  },
  imported_count: {
    type: Number,
    default: 0
  },
  conflict_count: {
    type: Number,
    default: 0
  },
  skipped_count: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['parsing', 'ready', 'in_progress', 'completed', 'failed'],
    default: 'parsing'
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('MovieImportJob', movieImportJobSchema);
