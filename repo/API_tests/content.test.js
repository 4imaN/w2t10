const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../api/src/app');
const User = require('../api/src/models/User');
const ContentItem = require('../api/src/models/ContentItem');
const ContentReview = require('../api/src/models/ContentReview');
const ConfigDictionary = require('../api/src/models/ConfigDictionary');
const { hashPassword } = require('../api/src/utils/crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let editorToken, reviewer1Token, reviewer2Token;
let contentId;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  await User.deleteMany({});
  await ContentItem.deleteMany({});
  await ContentReview.deleteMany({});

  await ConfigDictionary.findOneAndUpdate(
    { key: 'sensitive_words' },
    { key: 'sensitive_words', value: ['violence', 'explicit'], category: 'sensitive_words' },
    { upsert: true }
  );

  await User.insertMany([
    { username: 'conteditor', password_hash: await hashPassword('Editor123!'), role: 'editor', display_name: 'Editor' },
    { username: 'contrev1', password_hash: await hashPassword('Reviewer123!'), role: 'reviewer', display_name: 'Reviewer 1' },
    { username: 'contrev2', password_hash: await hashPassword('Reviewer123!'), role: 'reviewer', display_name: 'Reviewer 2' }
  ]);

  let res = await request(app).post('/api/auth/login').send({ username: 'conteditor', password: 'Editor123!' });
  editorToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'contrev1', password: 'Reviewer123!' });
  reviewer1Token = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'contrev2', password: 'Reviewer123!' });
  reviewer2Token = res.body.token;
});

afterAll(async () => {
  await User.deleteMany({});
  await ContentItem.deleteMany({});
  await ContentReview.deleteMany({});
  await mongoose.disconnect();
});

describe('Content Publishing API', () => {
  test('POST /api/content — create draft', async () => {
    const res = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ content_type: 'article', title: 'Test Article', body: 'A great article body' });
    expect(res.status).toBe(201);
    expect(res.body.item.status).toBe('draft');
    contentId = res.body.item._id;
  });

  test('POST /api/content/:id/submit — submit for review', async () => {
    const res = await request(app)
      .post(`/api/content/${contentId}/submit`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ acknowledgedSensitiveWords: false });
    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('in_review_1');
  });

  test('POST /api/content-review/:id/review — step 1 approve', async () => {
    const res = await request(app)
      .post(`/api/content-review/${contentId}/review`)
      .set('Authorization', `Bearer ${reviewer1Token}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('in_review_2');
  });

  test('POST /api/content-review/:id/review — step 2 must be different reviewer', async () => {
    const res = await request(app)
      .post(`/api/content-review/${contentId}/review`)
      .set('Authorization', `Bearer ${reviewer1Token}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(403);
  });

  test('POST /api/content-review/:id/review — step 2 approve by different reviewer', async () => {
    const res = await request(app)
      .post(`/api/content-review/${contentId}/review`)
      .set('Authorization', `Bearer ${reviewer2Token}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('published');
  });

  test('POST /api/content-review — rejection requires reason', async () => {
    // Create another content item to test rejection
    const createRes = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ content_type: 'article', title: 'Reject Test', body: 'Body' });
    const newId = createRes.body.item._id;

    await request(app)
      .post(`/api/content/${newId}/submit`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ acknowledgedSensitiveWords: false });

    // Try to reject without reason
    const res = await request(app)
      .post(`/api/content-review/${newId}/review`)
      .set('Authorization', `Bearer ${reviewer1Token}`)
      .send({ decision: 'rejected' });
    expect(res.status).toBe(422);

    // Reject with reason
    const res2 = await request(app)
      .post(`/api/content-review/${newId}/review`)
      .set('Authorization', `Bearer ${reviewer1Token}`)
      .send({ decision: 'rejected', rejection_reason: 'Needs more detail' });
    expect(res2.status).toBe(200);
    expect(res2.body.item.status).toBe('draft');
  });
});
