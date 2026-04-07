const ConfigDictionary = require('../models/ConfigDictionary');

let cache = {};
let cacheTimestamp = 0;
const CACHE_TTL = 60000;

async function refreshCache() {
  const configs = await ConfigDictionary.find({});
  const newCache = {};
  for (const c of configs) {
    newCache[c.key] = c.value;
  }
  cache = newCache;
  cacheTimestamp = Date.now();
}

async function getConfig(key, defaultValue = null) {
  if (Date.now() - cacheTimestamp > CACHE_TTL) {
    await refreshCache();
  }
  return cache[key] !== undefined ? cache[key] : defaultValue;
}

async function getAllConfigs(category = null) {
  const query = category ? { category } : {};
  return ConfigDictionary.find(query).sort({ category: 1, key: 1 });
}

async function setConfig(key, value, category, description) {
  const existing = await ConfigDictionary.findOne({ key });

  if (existing) {
    existing.value = value;
    if (category !== undefined && category !== null) existing.category = category;
    if (description !== undefined) existing.description = description;
    await existing.save();
    cache[key] = value;
    return existing;
  }

  if (!category) {
    const { ValidationError } = require('../utils/errors');
    throw new ValidationError('Category is required when creating a new config entry');
  }

  const config = await ConfigDictionary.create({ key, value, category, description });
  cache[key] = value;
  return config;
}

const PROTECTED_KEYS = [
  'auto_cancel_minutes',
  'free_cancel_window_minutes',
  'min_ride_advance_minutes',
  'dispute_escalation_hours',
  'max_ride_payment_amount',
  'time_drift_threshold_seconds',
  'sensor_retention_days',
  'ledger_max_retries',
  'featured_tags',
];

async function deleteConfig(key) {
  if (PROTECTED_KEYS.includes(key)) {
    const { ValidationError } = require('../utils/errors');
    throw new ValidationError(`Cannot delete protected config key '${key}'`);
  }
  await ConfigDictionary.deleteOne({ key });
  delete cache[key];
}

module.exports = {
  getConfig,
  getAllConfigs,
  setConfig,
  deleteConfig,
  refreshCache
};
