const User = require('../models/User');
const { hashPassword, encrypt, decrypt } = require('../utils/crypto');
const { maskPhone } = require('../utils/phone-mask');
const { NotFoundError, ConflictError } = require('../utils/errors');

function sanitizeUser(user) {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password_hash;
  delete obj.__v;
  delete obj.phone_encrypted;

  const rawPhone = obj.phone || (user.phone_encrypted ? decrypt(user.phone_encrypted) : null);
  obj.phone = maskPhone(rawPhone);

  return obj;
}

async function createUser(data) {
  const existing = await User.findOne({ username: data.username });
  if (existing) throw new ConflictError('Username already exists');

  const userData = {
    username: data.username,
    password_hash: await hashPassword(data.password),
    role: data.role,
    display_name: data.display_name || data.username,
    phone: null,
    phone_encrypted: data.phone ? encrypt(data.phone) : null
  };

  const user = await User.create(userData);
  return sanitizeUser(user);
}

async function getUsers(filters = {}, page = 1, limit = 20) {
  const query = { deleted_at: null };
  if (filters.role) query.role = filters.role;
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    query.$or = [
      { username: new RegExp(filters.search, 'i') },
      { display_name: new RegExp(filters.search, 'i') }
    ];
  }

  const total = await User.countDocuments(query);
  const users = await User.find(query)
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    users: users.map(u => sanitizeUser(u)),
    total,
    page,
    pages: Math.ceil(total / limit)
  };
}

async function getUserById(id) {
  const user = await User.findOne({ _id: id, deleted_at: null });
  if (!user) throw new NotFoundError('User');
  return sanitizeUser(user);
}

async function updateUser(id, updates) {
  const user = await User.findOne({ _id: id, deleted_at: null });
  if (!user) throw new NotFoundError('User');

  if (updates.password) {
    user.password_hash = await hashPassword(updates.password);
  }
  if (updates.role) user.role = updates.role;
  if (updates.display_name !== undefined) user.display_name = updates.display_name;
  if (updates.phone && updates.phone.trim() && !updates.phone.includes('***')) {
    user.phone = null;
    user.phone_encrypted = encrypt(updates.phone);
  }
  if (updates.status) user.status = updates.status;

  await user.save();
  return sanitizeUser(user);
}

async function deleteUser(id) {
  const user = await User.findOne({ _id: id, deleted_at: null });
  if (!user) throw new NotFoundError('User');
  user.deleted_at = new Date();
  await user.save();
}

async function migratePhonesToEncrypted() {
  const users = await User.find({ phone: { $ne: null, $exists: true }, phone_encrypted: null });
  let migrated = 0;
  for (const user of users) {
    if (user.phone && user.phone.trim()) {
      user.phone_encrypted = encrypt(user.phone);
      user.phone = null;
      await user.save();
      migrated++;
    }
  }
  return migrated;
}

module.exports = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  sanitizeUser,
  migratePhonesToEncrypted
};
