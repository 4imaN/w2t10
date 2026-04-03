const ConfigDictionary = require('../models/ConfigDictionary');

// In-memory cache with TTL
let cache = {};
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 60 seconds default

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
  const config = await ConfigDictionary.findOneAndUpdate(
    { key },
    { key, value, category, description },
    { upsert: true, new: true }
  );
  // Invalidate cache
  cache[key] = value;
  return config;
}

async function deleteConfig(key) {
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
