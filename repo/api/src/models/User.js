const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  password_hash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: ['administrator', 'editor', 'reviewer', 'dispatcher', 'regular_user'],
    default: 'regular_user'
  },
  display_name: {
    type: String,
    trim: true,
    maxlength: 100
  },
  phone: {
    type: String,
    default: null
  },
  phone_encrypted: {
    type: String,
    default: null
  },
  must_change_password: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

userSchema.index({ username: 'text', display_name: 'text' });
userSchema.index({ role: 1, status: 1 });

module.exports = mongoose.model('User', userSchema);
