const ConfigDictionary = require('../models/ConfigDictionary');

let cachedWords = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 60 seconds

async function getSensitiveWords() {
  const now = Date.now();
  if (cachedWords && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedWords;
  }

  const config = await ConfigDictionary.findOne({ key: 'sensitive_words' });
  cachedWords = config ? config.value : [];
  cacheTimestamp = now;
  return cachedWords;
}

async function scanForSensitiveWords(text) {
  if (!text) return [];
  const words = await getSensitiveWords();
  if (!words || words.length === 0) return [];

  const lowerText = text.toLowerCase();
  const found = [];

  for (const word of words) {
    if (lowerText.includes(word.toLowerCase())) {
      found.push(word);
    }
  }

  return found;
}

module.exports = { getSensitiveWords, scanForSensitiveWords };
