const request = require('supertest');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app, editorToken;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-content-types';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;

  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.deleteMany({ username: 'ct_editor' });
  await User.create({
    username: 'ct_editor',
    password_hash: await hashPassword('Test1234!'),
    role: 'editor',
    display_name: 'CT Editor'
  });

  const res = await request(app).post('/api/auth/login')
    .send({ username: 'ct_editor', password: 'Test1234!' });
  editorToken = res.body.token;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  await User.deleteMany({ username: 'ct_editor' });
  await mongoose.disconnect();
});

describe('Content Type-Specific Support — Gallery', () => {
  test('creating gallery content stores gallery_items', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        title: 'Gallery Test', body: 'Gallery body', content_type: 'gallery',
        gallery_items: [
          { media_url: 'http://img/1.jpg', caption: 'First', sort_order: 0 },
          { media_url: 'http://img/2.jpg', caption: 'Second', sort_order: 1 }
        ]
      });
    expect(res.status).toBe(201);
    expect(res.body.item.content_type).toBe('gallery');
    expect(res.body.item.gallery_items).toHaveLength(2);
    expect(res.body.item.gallery_items[0].caption).toBe('First');
  });
});

describe('Content Type-Specific Support — Video', () => {
  test('creating video content with video_url succeeds', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        title: 'Video Test', content_type: 'video',
        video_url: 'https://video.example.com/v.mp4',
        video_duration_seconds: 120,
        video_format: 'mp4'
      });
    expect(res.status).toBe(201);
    expect(res.body.item.video_url).toBe('https://video.example.com/v.mp4');
    expect(res.body.item.video_duration_seconds).toBe(120);
  });

  test('video without url or body fails validation (422)', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Bad Video', content_type: 'video' });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('Video content requires');
  });

  test('video with body but no url succeeds', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Video Body Only', body: 'Embedded video description', content_type: 'video' });
    expect(res.status).toBe(201);
  });
});

describe('Content Type-Specific Support — Event', () => {
  test('creating event content with event_date succeeds', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        title: 'Event Test', body: 'Event body', content_type: 'event',
        event_date: '2026-06-01T10:00:00Z',
        event_end_date: '2026-06-01T18:00:00Z',
        event_location: 'Convention Center',
        event_capacity: 500
      });
    expect(res.status).toBe(201);
    expect(res.body.item.event_location).toBe('Convention Center');
    expect(res.body.item.event_capacity).toBe(500);
  });

  test('event without event_date fails validation (422)', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Bad Event', body: 'no date', content_type: 'event' });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('event_date');
  });

  test('event with end_date before start fails validation (422)', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        title: 'Bad Event Dates', body: 'wrong order', content_type: 'event',
        event_date: '2026-06-02T10:00:00Z',
        event_end_date: '2026-06-01T10:00:00Z'
      });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('event_end_date must be after');
  });
});

describe('Content Type — Validation & Revision Flow', () => {
  let articleId;

  test('article creation includes revision snapshot', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Revision Check', body: 'body', content_type: 'article' });
    expect(res.status).toBe(201);
    articleId = res.body.item._id;

    const detail = await request(app).get(`/api/content/${articleId}`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.item.revisions).toBeDefined();
    expect(detail.body.item.revisions.length).toBeGreaterThanOrEqual(1);
    expect(detail.body.item.revisions[0].change_type).toBe('create');
  });

  test('updating content adds edit revision with type fields', async () => {
    const res = await request(app).put(`/api/content/${articleId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Revision Check Updated', body: 'updated body' });
    expect(res.status).toBe(200);

    const detail = await request(app).get(`/api/content/${articleId}`)
      .set('Authorization', `Bearer ${editorToken}`);
    const revisions = detail.body.item.revisions;
    expect(revisions.length).toBe(2);
    expect(revisions[1].change_type).toBe('edit');
    expect(revisions[1].snapshot.title).toBe('Revision Check Updated');
  });
});
