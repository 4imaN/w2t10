jest.mock('../api/src/models/ConfigDictionary', () => ({
  findOne: jest.fn().mockResolvedValue({
    value: ['violence', 'explicit', 'graphic', 'hate']
  })
}));

const { scanForSensitiveWords } = require('../api/src/utils/sensitive-words');

describe('Sensitive Words Scanner', () => {
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

  test('handles null/empty input', async () => {
    expect(await scanForSensitiveWords(null)).toEqual([]);
    expect(await scanForSensitiveWords('')).toEqual([]);
  });
});
