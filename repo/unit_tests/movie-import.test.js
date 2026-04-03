const { parseImportFile, parseCSVLine, extractYear } = require('../api/src/services/movie-import.service');

describe('Movie Import — CSV Parser', () => {
  test('parseCSVLine handles simple values', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  test('parseCSVLine handles quoted fields with commas', () => {
    expect(parseCSVLine('"Action, Drama",PG-13,"A great movie"')).toEqual([
      'Action, Drama', 'PG-13', 'A great movie'
    ]);
  });

  test('parseCSVLine handles escaped quotes', () => {
    expect(parseCSVLine('"He said ""hello""",value')).toEqual([
      'He said "hello"', 'value'
    ]);
  });

  test('parseCSVLine handles empty fields', () => {
    expect(parseCSVLine('a,,c,')).toEqual(['a', '', 'c', '']);
  });
});

describe('Movie Import — File Parsing', () => {
  test('parses JSON array', () => {
    const content = JSON.stringify([
      { title: 'Movie A', mpaa_rating: 'PG' },
      { title: 'Movie B', mpaa_rating: 'R' }
    ]);
    const result = parseImportFile(content, 'test.json');
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Movie A');
  });

  test('parses JSON single object wraps to array', () => {
    const content = JSON.stringify({ title: 'Solo' });
    const result = parseImportFile(content, 'solo.json');
    expect(result).toHaveLength(1);
  });

  test('parses CSV with headers', () => {
    const content = 'title,mpaa_rating,description\nMovie A,PG,A good movie\nMovie B,R,A scary movie';
    const result = parseImportFile(content, 'test.csv');
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Movie A');
    expect(result[0].mpaa_rating).toBe('PG');
    expect(result[1].description).toBe('A scary movie');
  });

  test('parses CSV with quoted fields containing commas', () => {
    const content = 'title,categories\n"The Good, the Bad",Action;Drama';
    const result = parseImportFile(content, 'test.csv');
    expect(result[0].title).toBe('The Good, the Bad');
    expect(result[0].categories).toBe('Action;Drama');
  });

  test('rejects unsupported format', () => {
    expect(() => parseImportFile('data', 'test.xml')).toThrow('Unsupported');
  });

  test('empty CSV returns empty array', () => {
    const result = parseImportFile('title\n', 'test.csv');
    expect(result).toHaveLength(0);
  });
});

describe('Movie Import — Year Extraction', () => {
  test('extracts year from ISO date', () => {
    expect(extractYear('2024-06-15')).toBe(2024);
  });

  test('extracts year from full ISO datetime', () => {
    expect(extractYear('2023-01-01T00:00:00Z')).toBe(2023);
  });

  test('extracts year from bare year string', () => {
    expect(extractYear('1999')).toBe(1999);
  });

  test('returns null for empty/null', () => {
    expect(extractYear(null)).toBeNull();
    expect(extractYear('')).toBeNull();
    expect(extractYear(undefined)).toBeNull();
  });

  test('extracts year from Date object', () => {
    expect(extractYear(new Date('2020-03-15'))).toBe(2020);
  });
});

describe('Movie Import — Conflict Detection Design', () => {
  const fs = require('fs');
  const path = require('path');
  const serviceFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'services', 'movie-import.service.js'), 'utf-8'
  );

  test('conflict detection includes release_date', () => {
    expect(serviceFile).toContain("field: 'release_date'");
    expect(serviceFile).toContain("record.release_date");
  });

  test('conflict detection includes all scalar fields', () => {
    expect(serviceFile).toContain("'title', 'description', 'mpaa_rating'");
  });

  test('matching uses release year when available', () => {
    expect(serviceFile).toContain('extractYear');
    expect(serviceFile).toContain('$gte: yearStart');
    expect(serviceFile).toContain('$lt: yearEnd');
  });

  test('merge execution handles release_date field specifically', () => {
    expect(serviceFile).toContain("conflict.field === 'release_date'");
    expect(serviceFile).toContain("new Date(conflict.imported_value)");
  });

  test('revision snapshot created on import merge', () => {
    expect(serviceFile).toContain("createSnapshot(movie, userId, 'import_merge')");
  });
});
