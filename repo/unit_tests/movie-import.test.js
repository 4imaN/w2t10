const { parseImportFile, parseCSVLine, extractYear, createImportJob } = require('../api/src/services/movie-import.service');

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

describe('Movie Import — Conflict Detection (behavioral)', () => {
  const mongoose = require('mongoose');
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-import';
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.NODE_ENV = 'test';
    await mongoose.connect(MONGO_URI);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  test('createImportJob detects conflicts on title+release_date', async () => {
    const Movie = require('../api/src/models/Movie');
    const userId = new mongoose.Types.ObjectId();

    const existing = await Movie.create({
      title: 'ConflictTest Movie',
      description: 'Original',
      mpaa_rating: 'PG',
      release_date: new Date('2024-06-15'),
      created_by: userId
    });

    const importContent = JSON.stringify([{
      title: 'ConflictTest Movie',
      description: 'Imported version',
      mpaa_rating: 'R',
      release_date: '2024-06-15'
    }]);

    const job = await createImportJob(importContent, 'test.json', userId);
    expect(job.records).toHaveLength(1);

    const record = job.records[0];
    expect(record.conflicts.length).toBeGreaterThan(0);
    const conflictFields = record.conflicts.map(c => c.field);
    expect(conflictFields).toContain('description');
    expect(conflictFields).toContain('mpaa_rating');

    await Movie.deleteOne({ _id: existing._id });
    const MovieImportJob = require('../api/src/models/MovieImportJob');
    await MovieImportJob.deleteOne({ _id: job._id });
  });

  test('import records without matching existing movie have no conflicts', async () => {
    const userId = new mongoose.Types.ObjectId();
    const importContent = JSON.stringify([{
      title: 'Brand New Unique Movie ' + Date.now(),
      description: 'Unique',
      mpaa_rating: 'G'
    }]);

    const job = await createImportJob(importContent, 'test.json', userId);
    expect(job.records[0].conflicts).toHaveLength(0);

    const MovieImportJob = require('../api/src/models/MovieImportJob');
    await MovieImportJob.deleteOne({ _id: job._id });
  });
});
