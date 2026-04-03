const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../api/src/app');
const User = require('../api/src/models/User');
const Movie = require('../api/src/models/Movie');
const ContentItem = require('../api/src/models/ContentItem');
const { hashPassword } = require('../api/src/utils/crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let adminToken, editorToken, userToken;
let unpublishedMovieId, publishedMovieId;
let draftContentId, publishedContentId;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  await User.deleteMany({});
  await Movie.deleteMany({});
  await ContentItem.deleteMany({});

  const [admin, editor, user] = await User.insertMany([
    { username: 'vis_admin', password_hash: await hashPassword('Pass1234!'), role: 'administrator', display_name: 'Admin' },
    { username: 'vis_editor', password_hash: await hashPassword('Pass1234!'), role: 'editor', display_name: 'Editor' },
    { username: 'vis_user', password_hash: await hashPassword('Pass1234!'), role: 'regular_user', display_name: 'User' },
  ]);

  let res;
  res = await request(app).post('/api/auth/login').send({ username: 'vis_admin', password: 'Pass1234!' });
  adminToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'vis_editor', password: 'Pass1234!' });
  editorToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'vis_user', password: 'Pass1234!' });
  userToken = res.body.token;

  // Create a published movie
  const pub = await Movie.create({ title: 'Published Movie', is_published: true, created_by: admin._id, revisions: [] });
  publishedMovieId = pub._id.toString();

  // Create an unpublished movie
  const unpub = await Movie.create({ title: 'Unpublished Movie', is_published: false, created_by: admin._id, revisions: [] });
  unpublishedMovieId = unpub._id.toString();

  // Create draft content
  const draft = await ContentItem.create({ content_type: 'article', title: 'Draft Article', body: 'draft', status: 'draft', author: editor._id, revisions: [] });
  draftContentId = draft._id.toString();

  // Create published content
  const pubContent = await ContentItem.create({ content_type: 'article', title: 'Published Article', body: 'published', status: 'published', author: editor._id, revisions: [] });
  publishedContentId = pubContent._id.toString();
});

afterAll(async () => {
  await User.deleteMany({});
  await Movie.deleteMany({});
  await ContentItem.deleteMany({});
  await mongoose.disconnect();
});

describe('Publication Visibility — Movies', () => {
  test('Regular user CAN access published movie', async () => {
    const res = await request(app).get(`/api/movies/${publishedMovieId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.movie.title).toBe('Published Movie');
  });

  test('Regular user CANNOT access unpublished movie (404)', async () => {
    const res = await request(app).get(`/api/movies/${unpublishedMovieId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  test('Editor CAN access unpublished movie', async () => {
    const res = await request(app).get(`/api/movies/${unpublishedMovieId}`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.movie.title).toBe('Unpublished Movie');
  });

  test('Admin CAN access unpublished movie', async () => {
    const res = await request(app).get(`/api/movies/${unpublishedMovieId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('Publication Visibility — Content', () => {
  test('Regular user CAN access published content', async () => {
    const res = await request(app).get(`/api/content/${publishedContentId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.item.title).toBe('Published Article');
  });

  test('Regular user CANNOT access draft content (404)', async () => {
    const res = await request(app).get(`/api/content/${draftContentId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  test('Editor CAN access draft content', async () => {
    const res = await request(app).get(`/api/content/${draftContentId}`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
  });

  test('Admin CAN access draft content', async () => {
    const res = await request(app).get(`/api/content/${draftContentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});
