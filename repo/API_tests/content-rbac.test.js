const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../api/src/app');
const User = require('../api/src/models/User');
const ContentItem = require('../api/src/models/ContentItem');
const { hashPassword } = require('../api/src/utils/crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let adminToken, editorToken, reviewerToken, dispatcherToken, userToken;
let draftId, publishedId, inReviewId;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  await User.deleteMany({});
  await ContentItem.deleteMany({});

  const [admin, editor, reviewer] = await User.insertMany([
    { username: 'crbac_admin', password_hash: await hashPassword('Pass1234!'), role: 'administrator', display_name: 'Admin' },
    { username: 'crbac_editor', password_hash: await hashPassword('Pass1234!'), role: 'editor', display_name: 'Editor' },
    { username: 'crbac_reviewer', password_hash: await hashPassword('Pass1234!'), role: 'reviewer', display_name: 'Reviewer' },
    { username: 'crbac_disp', password_hash: await hashPassword('Pass1234!'), role: 'dispatcher', display_name: 'Dispatcher' },
    { username: 'crbac_user', password_hash: await hashPassword('Pass1234!'), role: 'regular_user', display_name: 'User' },
  ]);

  let res;
  res = await request(app).post('/api/auth/login').send({ username: 'crbac_admin', password: 'Pass1234!' });
  adminToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'crbac_editor', password: 'Pass1234!' });
  editorToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'crbac_reviewer', password: 'Pass1234!' });
  reviewerToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'crbac_disp', password: 'Pass1234!' });
  dispatcherToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'crbac_user', password: 'Pass1234!' });
  userToken = res.body.token;

  // Create content in different states
  const draft = await ContentItem.create({ content_type: 'article', title: 'Draft Art', body: 'x', status: 'draft', author: editor._id, revisions: [] });
  draftId = draft._id.toString();
  const pub = await ContentItem.create({ content_type: 'article', title: 'Published Art', body: 'y', status: 'published', author: editor._id, revisions: [] });
  publishedId = pub._id.toString();
  const review = await ContentItem.create({ content_type: 'article', title: 'In Review Art', body: 'z', status: 'in_review_1', author: editor._id, revisions: [] });
  inReviewId = review._id.toString();
});

afterAll(async () => {
  await User.deleteMany({});
  await ContentItem.deleteMany({});
  await mongoose.disconnect();
});

describe('Content RBAC — List Endpoint', () => {
  test('regular_user sees only published content in list', async () => {
    const res = await request(app).get('/api/content')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(item.status).toBe('published');
    }
  });

  test('dispatcher sees only published content in list', async () => {
    const res = await request(app).get('/api/content')
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(item.status).toBe('published');
    }
  });

  test('editor sees all content statuses in list', async () => {
    const res = await request(app).get('/api/content')
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    const statuses = res.body.items.map(i => i.status);
    expect(statuses).toContain('draft');
    expect(statuses).toContain('published');
  });

  test('reviewer sees all content statuses in list', async () => {
    const res = await request(app).get('/api/content')
      .set('Authorization', `Bearer ${reviewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(1);
  });
});

describe('Content RBAC — Detail Endpoint', () => {
  test('regular_user gets 404 for draft content', async () => {
    const res = await request(app).get(`/api/content/${draftId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  test('dispatcher gets 404 for draft content', async () => {
    const res = await request(app).get(`/api/content/${draftId}`)
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(404);
  });

  test('dispatcher gets 404 for in_review content', async () => {
    const res = await request(app).get(`/api/content/${inReviewId}`)
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(404);
  });

  test('regular_user CAN access published content', async () => {
    const res = await request(app).get(`/api/content/${publishedId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
  });

  test('editor CAN access draft content', async () => {
    const res = await request(app).get(`/api/content/${draftId}`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
  });

  test('reviewer CAN access in_review content', async () => {
    const res = await request(app).get(`/api/content/${inReviewId}`)
      .set('Authorization', `Bearer ${reviewerToken}`);
    expect(res.status).toBe(200);
  });
});
