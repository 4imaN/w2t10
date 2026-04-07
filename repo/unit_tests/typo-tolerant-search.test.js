const { fuzzySearch } = require('../api/src/utils/fuzzy-search');

const MOVIES = [
  { _id: '1', title: 'The Godfather', description: 'The aging patriarch of a crime dynasty', tags: ['drama', 'crime'] },
  { _id: '2', title: 'The Shawshank Redemption', description: 'Two imprisoned men bond', tags: ['drama'] },
  { _id: '3', title: 'The Dark Knight', description: 'Batman faces the Joker', tags: ['action', 'thriller'] },
  { _id: '4', title: 'Pulp Fiction', description: 'The lives of two mob hitmen', tags: ['crime', 'drama'] },
  { _id: '5', title: 'Schindlers List', description: 'A German industrialist', tags: ['drama', 'history'] },
  { _id: '6', title: 'Inception', description: 'A thief enters dreams', tags: ['sci-fi', 'action'] },
];

describe('Typo-Tolerant Search (Fuse.js)', () => {
  test('exact match returns correct movie', () => {
    const results = fuzzySearch(MOVIES, 'Godfather', ['title', 'description', 'tags']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe('The Godfather');
  });

  test('typo "Godfathr" still finds The Godfather', () => {
    const results = fuzzySearch(MOVIES, 'Godfathr', ['title']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe('The Godfather');
  });

  test('typo "Shawshnk" finds The Shawshank Redemption', () => {
    const results = fuzzySearch(MOVIES, 'Shawshnk', ['title']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('Shawshank');
  });

  test('typo "Dar Knigh" finds The Dark Knight', () => {
    const results = fuzzySearch(MOVIES, 'Dar Knigh', ['title']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe('The Dark Knight');
  });

  test('typo "Incpetion" finds Inception', () => {
    const results = fuzzySearch(MOVIES, 'Incpetion', ['title']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe('Inception');
  });

  test('partial match "Pulp" finds Pulp Fiction', () => {
    const results = fuzzySearch(MOVIES, 'Pulp', ['title']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe('Pulp Fiction');
  });

  test('description search "Batman" finds Dark Knight', () => {
    const results = fuzzySearch(MOVIES, 'Batman', ['title', 'description']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe('The Dark Knight');
  });

  test('tag search "crime" finds relevant movies', () => {
    const results = fuzzySearch(MOVIES, 'crime', ['tags']);
    expect(results.length).toBeGreaterThan(0);
  });

  test('completely unrelated query returns empty', () => {
    const results = fuzzySearch(MOVIES, 'xyzzyplugh', ['title']);
    expect(results).toHaveLength(0);
  });

  test('fuzzy results include _fuzzyScore', () => {
    const results = fuzzySearch(MOVIES, 'Godfather', ['title']);
    expect(results[0]).toHaveProperty('_fuzzyScore');
    expect(typeof results[0]._fuzzyScore).toBe('number');
  });
});

describe('Typo-Tolerant Suggestions', () => {
  const SUGGESTIONS = [
    { text: 'The Godfather', type: 'movie', score: 100 },
    { text: 'Inception', type: 'movie', score: 90 },
    { text: 'The Dark Knight', type: 'movie', score: 80 },
    { text: 'Interstellar', type: 'movie', score: 70 },
  ];

  test('fuzzy suggestion for misspelled "Godfathr"', () => {
    const results = fuzzySearch(SUGGESTIONS, 'Godfathr', ['text'], { threshold: 0.5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toBe('The Godfather');
  });

  test('fuzzy suggestion for misspelled "Interstelar"', () => {
    const results = fuzzySearch(SUGGESTIONS, 'Interstelar', ['text'], { threshold: 0.5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toBe('Interstellar');
  });
});

describe('Search Service — Fuzzy Fallback (behavioral)', () => {
  const request = require('supertest');
  const mongoose = require('mongoose');
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';
  let app, token;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-search';
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.NODE_ENV = 'test';
    process.env.MONGO_URI = MONGO_URI;
    await mongoose.connect(MONGO_URI);
    app = require('../api/src/app');

    const User = require('../api/src/models/User');
    const { hashPassword } = require('../api/src/utils/crypto');
    await User.deleteMany({ username: 'ts_user' });
    await User.create({
      username: 'ts_user', password_hash: await hashPassword('Test1234!'),
      role: 'regular_user', display_name: 'TS User'
    });
    const res = await request(app).post('/api/auth/login')
      .send({ username: 'ts_user', password: 'Test1234!' });
    token = res.body.token;
  });

  afterAll(async () => {
    const User = require('../api/src/models/User');
    await User.deleteMany({ username: 'ts_user' });
    await mongoose.disconnect();
  });

  test('search endpoint returns results for exact query', async () => {
    const res = await request(app).get('/api/search?q=movie')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('movies');
    expect(res.body).toHaveProperty('content');
  });

  test('search endpoint handles typo via fuzzy fallback', async () => {
    const res = await request(app).get('/api/search?q=xyznonexistent')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.movies)).toBe(true);
  });

  test('suggest endpoint returns suggestions', async () => {
    const res = await request(app).get('/api/search/suggest?q=mov')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('suggestions');
  });
});
