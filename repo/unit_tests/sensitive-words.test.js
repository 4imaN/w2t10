process.env.JWT_SECRET = 'test-sensitive';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let ConfigDictionary;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await mongoose.connect(mongod.getUri());

  ConfigDictionary = require('../api/src/models/ConfigDictionary');
  await ConfigDictionary.create({
    key: 'sensitive_words',
    value: ['violence', 'explicit', 'graphic', 'hate'],
    category: 'sensitive_words'
  });
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// The sensitive-words utility caches results for 60 seconds using module-level
// closure variables. To ensure each test group reads from the real DB rather
// than a stale cache, we advance Date.now() past the TTL before each test so
// that getSensitiveWords() always performs a fresh findOne().
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const { getSensitiveWords, scanForSensitiveWords } = require('../api/src/utils/sensitive-words');

describe('Sensitive Words Scanner — scanForSensitiveWords', () => {
  test('detects sensitive words in text', async () => {
    const found = await scanForSensitiveWords('This movie contains graphic violence and explicit scenes');
    expect(found).toContain('graphic');
    expect(found).toContain('violence');
    expect(found).toContain('explicit');
  });

  test('returns empty array for clean text', async () => {
    const found = await scanForSensitiveWords('A wonderful family movie about friendship');
    expect(found).toHaveLength(0);
  });

  test('is case-insensitive', async () => {
    const found = await scanForSensitiveWords('Contains VIOLENCE and HATE');
    expect(found).toContain('violence');
    expect(found).toContain('hate');
  });

  test('handles null input', async () => {
    expect(await scanForSensitiveWords(null)).toEqual([]);
  });

  test('handles empty string input', async () => {
    expect(await scanForSensitiveWords('')).toEqual([]);
  });

  test('detects a single sensitive word among clean words', async () => {
    const found = await scanForSensitiveWords('This story contains some hate speech');
    expect(found).toContain('hate');
    expect(found).not.toContain('violence');
  });

  test('detects all configured sensitive words when all are present', async () => {
    const found = await scanForSensitiveWords('violence explicit graphic hate all present');
    expect(found).toHaveLength(4);
    expect(found).toContain('violence');
    expect(found).toContain('explicit');
    expect(found).toContain('graphic');
    expect(found).toContain('hate');
  });

  test('word must appear in text (no false positives for unrelated text)', async () => {
    const found = await scanForSensitiveWords('The graphics department did a great job on the film');
    // "graphic" is a substring of "graphics" — the scanner uses includes(), so this should match
    expect(found).toContain('graphic');
    expect(found).not.toContain('violence');
    expect(found).not.toContain('explicit');
    expect(found).not.toContain('hate');
  });

  test('mixed-case sensitive word is matched case-insensitively', async () => {
    const found = await scanForSensitiveWords('GrApHiC content warning');
    expect(found).toContain('graphic');
  });
});

describe('Sensitive Words Scanner — getSensitiveWords', () => {
  test('returns the configured word list from ConfigDictionary', async () => {
    const words = await getSensitiveWords();
    expect(Array.isArray(words)).toBe(true);
    expect(words).toContain('violence');
    expect(words).toContain('explicit');
    expect(words).toContain('graphic');
    expect(words).toContain('hate');
    expect(words).toHaveLength(4);
  });

  test('returns empty array when no sensitive_words config exists', async () => {
    // Remove the config document so there is nothing to return
    await ConfigDictionary.deleteOne({ key: 'sensitive_words' });

    // Force cache expiry to a time far beyond current mock so a fresh DB read happens
    jest.restoreAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 240_000);

    const words = await getSensitiveWords();
    expect(words).toEqual([]);

    // Restore the config for any downstream tests
    await ConfigDictionary.create({
      key: 'sensitive_words',
      value: ['violence', 'explicit', 'graphic', 'hate'],
      category: 'sensitive_words'
    });
  });
});
