const request = require('supertest');
const path = require('path');
const { startTestDb, stopTestDb } = require('./helpers/setup');

let app, token;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-import';
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

  await startTestDb();
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const Movie = require('../api/src/models/Movie');
  const { hashPassword } = require('../api/src/utils/crypto');

  const editor = await User.create({
    username: 'imp_editor',
    password_hash: await hashPassword('Test1234!'),
    role: 'editor',
    display_name: 'Import Editor'
  });

  await Movie.create({
    title: 'Existing Movie',
    description: 'Already in DB',
    mpaa_rating: 'PG',
    release_date: new Date('2024-01-15'),
    categories: ['Drama'],
    is_published: true,
    created_by: editor._id,
    revisions: []
  });

  const res = await request(app).post('/api/auth/login')
    .send({ username: 'imp_editor', password: 'Test1234!' });
  token = res.body.token;
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

describe('Movie Import — Upload Validation', () => {
  test('rejects non-JSON/CSV file extension', async () => {
    const res = await request(app).post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('data'), { filename: 'test.xml' });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('JSON and CSV');
  });

  test('rejects invalid JSON content', async () => {
    const res = await request(app).post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not valid json {{{'), { filename: 'bad.json' });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('Invalid JSON');
  });

  test('rejects empty CSV', async () => {
    const res = await request(app).post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('title\n'), { filename: 'empty.csv' });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('header row');
  });

  test('accepts valid JSON import', async () => {
    const data = JSON.stringify([{ title: 'New Import Movie', mpaa_rating: 'R' }]);
    const res = await request(app).post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(data), { filename: 'movies.json' });
    expect(res.status).toBe(201);
    expect(res.body.job.total_records).toBe(1);
  });
});

describe('Movie Import — Conflict Blocking', () => {
  let jobId;

  test('import with conflict is detected', async () => {
    const data = JSON.stringify([
      { title: 'Existing Movie', mpaa_rating: 'R', description: 'Different desc' }
    ]);
    const res = await request(app).post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(data), { filename: 'conflict.json' });
    expect(res.status).toBe(201);
    expect(res.body.job.conflict_count).toBeGreaterThan(0);
    jobId = res.body.job._id;
  });

  test('execute is blocked when conflicts are unresolved', async () => {
    const res = await request(app).post(`/api/movie-import/${jobId}/execute`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('unresolved conflicts');
  });

  test('skip a conflicted record', async () => {
    const res = await request(app).post(`/api/movie-import/${jobId}/skip/0`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.job.records[0].status).toBe('skipped');
  });

  test('execute succeeds after skip', async () => {
    const res = await request(app).post(`/api/movie-import/${jobId}/execute`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.job.status).toBe('completed');
  });
});

describe('Movie Import — Conflict Resolution + Revision', () => {
  let jobId;

  test('create import with conflict', async () => {
    const data = JSON.stringify([
      { title: 'Existing Movie', mpaa_rating: 'NC-17' }
    ]);
    const res = await request(app).post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(data), { filename: 'resolve.json' });
    expect(res.status).toBe(201);
    jobId = res.body.job._id;
  });

  test('resolve conflict field-by-field', async () => {
    const res = await request(app).put(`/api/movie-import/${jobId}/resolve/0`)
      .set('Authorization', `Bearer ${token}`)
      .send({ resolutions: { mpaa_rating: 'use_imported' } });
    expect(res.status).toBe(200);
  });

  test('execute after resolution succeeds', async () => {
    const res = await request(app).post(`/api/movie-import/${jobId}/execute`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.job.imported_count).toBe(1);
  });

  test('merged movie has revision history', async () => {
    const Movie = require('../api/src/models/Movie');
    const movie = await Movie.findOne({ title: 'Existing Movie' });
    expect(movie.revisions.length).toBeGreaterThanOrEqual(1);
    const mergeRevision = movie.revisions.find(r => r.change_type === 'import_merge');
    expect(mergeRevision).toBeTruthy();
  });
});
