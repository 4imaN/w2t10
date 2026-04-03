import { describe, test, expect } from 'vitest';

// Test search filter parameter construction logic
// This validates that filter values are correctly passed to the search URL

function buildSearchParams(query, type, sort) {
  const params = new URLSearchParams({ q: query.trim() });
  if (type) params.set('type', type);
  if (sort) params.set('sort', sort);
  return params.toString();
}

describe('Search Filter Parameter Construction', () => {
  test('basic query without filters', () => {
    const result = buildSearchParams('batman', '', '');
    expect(result).toBe('q=batman');
  });

  test('query with type filter', () => {
    const result = buildSearchParams('batman', 'movie', '');
    expect(result).toBe('q=batman&type=movie');
  });

  test('query with sort filter', () => {
    const result = buildSearchParams('batman', '', 'popularity');
    expect(result).toBe('q=batman&sort=popularity');
  });

  test('query with both filters', () => {
    const result = buildSearchParams('batman', 'movie', 'rating');
    expect(result).toBe('q=batman&type=movie&sort=rating');
  });

  test('query is trimmed', () => {
    const result = buildSearchParams('  batman  ', '', '');
    expect(result).toBe('q=batman');
  });

  test('all sort options produce valid params', () => {
    const sorts = ['', 'popularity', 'newest', 'rating'];
    for (const s of sorts) {
      const result = buildSearchParams('test', '', s);
      if (s) {
        expect(result).toContain(`sort=${s}`);
      } else {
        expect(result).not.toContain('sort=');
      }
    }
  });

  test('all type options produce valid params', () => {
    const types = ['', 'movie', 'content', 'user'];
    for (const t of types) {
      const result = buildSearchParams('test', t, '');
      if (t) {
        expect(result).toContain(`type=${t}`);
      } else {
        expect(result).not.toContain('type=');
      }
    }
  });
});
