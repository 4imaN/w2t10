const request = require('supertest');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app;
let editorToken, userToken;
let movieId, contentId;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-revision';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;

  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.deleteMany({ username: /^rev_/ });

  await User.create({
    username: 'rev_editor',
    password_hash: await hashPassword('Test1234!'),
    role: 'editor',
    display_name: 'Rev Editor'
  });
  await User.create({
    username: 'rev_user',
    password_hash: await hashPassword('Test1234!'),
    role: 'regular_user',
    display_name: 'Rev User'
  });

  let res = await request(app).post('/api/auth/login')
    .send({ username: 'rev_editor', password: 'Test1234!' });
  editorToken = res.body.token;

  res = await request(app).post('/api/auth/login')
    .send({ username: 'rev_user', password: 'Test1234!' });
  userToken = res.body.token;

  res = await request(app).post('/api/movies')
    .set('Authorization', `Bearer ${editorToken}`)
    .send({ title: 'Revision Test Movie ' + Date.now(), description: 'test' });
  movieId = res.body.movie._id;

  res = await request(app).post('/api/content')
    .set('Authorization', `Bearer ${editorToken}`)
    .send({ title: 'Revision Test Content ' + Date.now(), body: 'test body', content_type: 'article' });
  contentId = res.body.item._id;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  await User.deleteMany({ username: /^rev_/ });
  await mongoose.disconnect();
});

describe('Revision History Exposure Prevention — Real Tests', () => {
  test('staff user sees revisions when requested', async () => {
    const res = await request(app).get(`/api/movies/${movieId}?revisions=true`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.movie.revisions).toBeDefined();
  });

  test('regular user does NOT see revisions on movie detail', async () => {
    const res = await request(app).get(`/api/movies/${movieId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.movie.revisions).toBeUndefined();
  });

  test('staff can access movie revision history endpoint', async () => {
    const res = await request(app).get(`/api/movies/${movieId}/revisions`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.revisions).toBeDefined();
  });

  test('regular user cannot access movie revision history endpoint', async () => {
    const res = await request(app).get(`/api/movies/${movieId}/revisions`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  test('regular user does NOT see revisions on content detail (draft is hidden)', async () => {
    const res = await request(app).get(`/api/content/${contentId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  test('editorial user sees content revisions', async () => {
    const res = await request(app).get(`/api/content/${contentId}`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.item.revisions).toBeDefined();
  });

  test('regular user cannot access content review history', async () => {
    const res = await request(app).get(`/api/content/${contentId}/reviews`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});
