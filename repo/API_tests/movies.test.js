const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../api/src/app');
const User = require('../api/src/models/User');
const Movie = require('../api/src/models/Movie');
const { hashPassword } = require('../api/src/utils/crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let adminToken, editorToken, userToken;
let movieId;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  await User.deleteMany({});
  await Movie.deleteMany({});

  const users = [
    { username: 'movadmin', password_hash: await hashPassword('Admin123!'), role: 'administrator', display_name: 'Admin' },
    { username: 'moveditor', password_hash: await hashPassword('Editor123!'), role: 'editor', display_name: 'Editor' },
    { username: 'movuser', password_hash: await hashPassword('User1234!'), role: 'regular_user', display_name: 'User' }
  ];
  await User.insertMany(users);

  let res = await request(app).post('/api/auth/login').send({ username: 'movadmin', password: 'Admin123!' });
  adminToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'moveditor', password: 'Editor123!' });
  editorToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'movuser', password: 'User1234!' });
  userToken = res.body.token;
});

afterAll(async () => {
  await User.deleteMany({});
  await Movie.deleteMany({});
  await mongoose.disconnect();
});

describe('Movies API', () => {
  test('POST /api/movies — create movie (editor)', async () => {
    const res = await request(app)
      .post('/api/movies')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        title: 'Test Movie',
        description: 'A test movie description',
        categories: ['Action', 'Drama'],
        tags: ['new-release'],
        mpaa_rating: 'PG-13',
        release_date: '2024-06-15'
      });
    expect(res.status).toBe(201);
    expect(res.body.movie.title).toBe('Test Movie');
    expect(res.body.movie.mpaa_rating).toBe('PG-13');
    expect(res.body.movie.is_published).toBe(true);
    expect(res.body.movie.revisions).toHaveLength(1);
    movieId = res.body.movie._id;
  });

  test('POST /api/movies — regular user forbidden', async () => {
    const res = await request(app)
      .post('/api/movies')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'Should Fail' });
    expect(res.status).toBe(403);
  });

  test('GET /api/movies — list movies', async () => {
    const res = await request(app)
      .get('/api/movies')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.movies.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThan(0);
  });

  test('GET /api/movies/:id — get movie', async () => {
    const res = await request(app)
      .get(`/api/movies/${movieId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.movie.title).toBe('Test Movie');
  });

  test('PUT /api/movies/:id — update movie', async () => {
    const res = await request(app)
      .put(`/api/movies/${movieId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Updated Movie', tags: ['updated', 'classic'] });
    expect(res.status).toBe(200);
    expect(res.body.movie.title).toBe('Updated Movie');
    expect(res.body.movie.tags).toContain('classic');
  });

  test('POST /api/movies/:id/unpublish — unpublish', async () => {
    const res = await request(app)
      .post(`/api/movies/${movieId}/unpublish`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.movie.is_published).toBe(false);
  });

  test('GET /api/movies — regular user cannot see unpublished', async () => {
    const res = await request(app)
      .get('/api/movies')
      .set('Authorization', `Bearer ${userToken}`);
    // The unpublished movie should not appear for regular users
    const found = res.body.movies.find(m => m._id === movieId);
    expect(found).toBeUndefined();
  });

  test('POST /api/movies/:id/republish — republish', async () => {
    const res = await request(app)
      .post(`/api/movies/${movieId}/republish`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.movie.is_published).toBe(true);
  });

  test('GET /api/movies/:id/revisions — revision history', async () => {
    const res = await request(app)
      .get(`/api/movies/${movieId}/revisions`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.revisions.length).toBeGreaterThanOrEqual(3); // create, edit, unpublish, republish
  });
});
