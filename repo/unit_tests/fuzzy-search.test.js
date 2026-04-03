const { fuzzySearch } = require('../api/src/utils/fuzzy-search');

describe('Fuzzy Search', () => {
  const movies = [
    { title: 'The Shawshank Redemption', description: 'Two imprisoned men' },
    { title: 'The Godfather', description: 'The aging patriarch of a crime dynasty' },
    { title: 'The Dark Knight', description: 'Batman faces the Joker' },
    { title: 'Pulp Fiction', description: 'The lives of two mob hitmen' },
    { title: 'Schindlers List', description: 'A German industrialist' }
  ];

  test('finds exact matches', () => {
    const results = fuzzySearch(movies, 'Godfather', ['title']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe('The Godfather');
  });

  test('handles typo-tolerant matching', () => {
    const results = fuzzySearch(movies, 'Godfathr', ['title']);
    // Should still find The Godfather with a typo
    expect(results.length).toBeGreaterThan(0);
  });

  test('searches across multiple keys', () => {
    const results = fuzzySearch(movies, 'Batman', ['title', 'description']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe('The Dark Knight');
  });

  test('returns empty for no match', () => {
    const results = fuzzySearch(movies, 'xyzxyzxyz', ['title']);
    expect(results).toHaveLength(0);
  });

  test('returns input for empty query', () => {
    const results = fuzzySearch(movies, '', ['title']);
    expect(results).toEqual(movies);
  });
});
