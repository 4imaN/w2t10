const request = require('supertest');
const { startTestDb, stopTestDb } = require('./helpers/setup');

let app;
let tokens = {};

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-rbac';
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';

  await startTestDb();
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const { hashPassword } = require('../api/src/utils/crypto');

  const roles = [
    { username: 'rbac_admin', role: 'administrator' },
    { username: 'rbac_editor', role: 'editor' },
    { username: 'rbac_reviewer', role: 'reviewer' },
    { username: 'rbac_dispatcher', role: 'dispatcher' },
    { username: 'rbac_user', role: 'regular_user' },
  ];

  for (const r of roles) {
    await User.create({
      username: r.username,
      password_hash: await hashPassword('Test1234!'),
      role: r.role,
      display_name: r.username
    });
    const res = await request(app).post('/api/auth/login')
      .send({ username: r.username, password: 'Test1234!' });
    tokens[r.role] = res.body.token;
  }
});

afterAll(async () => {
  await stopTestDb();
});

describe('RBAC — Admin-only endpoints', () => {
  test('admin can list users', async () => {
    const res = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${tokens.administrator}`);
    expect(res.status).toBe(200);
  });

  test('editor cannot list users', async () => {
    const res = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(403);
  });

  test('regular_user cannot list users', async () => {
    const res = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${tokens.regular_user}`);
    expect(res.status).toBe(403);
  });

  test('admin can access config', async () => {
    const res = await request(app).get('/api/config')
      .set('Authorization', `Bearer ${tokens.administrator}`);
    expect(res.status).toBe(200);
  });

  test('dispatcher cannot access config', async () => {
    const res = await request(app).get('/api/config')
      .set('Authorization', `Bearer ${tokens.dispatcher}`);
    expect(res.status).toBe(403);
  });
});

describe('RBAC — Dispatch endpoints', () => {
  test('dispatcher can access dispatch queue', async () => {
    const res = await request(app).get('/api/dispatch/queue')
      .set('Authorization', `Bearer ${tokens.dispatcher}`);
    expect(res.status).toBe(200);
  });

  test('editor cannot access dispatch queue', async () => {
    const res = await request(app).get('/api/dispatch/queue')
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(403);
  });

  test('regular_user cannot access dispatch queue', async () => {
    const res = await request(app).get('/api/dispatch/queue')
      .set('Authorization', `Bearer ${tokens.regular_user}`);
    expect(res.status).toBe(403);
  });
});

describe('RBAC — Content staff-only', () => {
  test('editor can create content', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${tokens.editor}`)
      .send({ title: 'Test', body: 'body', content_type: 'article' });
    expect(res.status).toBe(201);
  });

  test('regular_user cannot create content', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${tokens.regular_user}`)
      .send({ title: 'Test', body: 'body', content_type: 'article' });
    expect(res.status).toBe(403);
  });

  test('dispatcher cannot create content', async () => {
    const res = await request(app).post('/api/content')
      .set('Authorization', `Bearer ${tokens.dispatcher}`)
      .send({ title: 'Test', body: 'body', content_type: 'article' });
    expect(res.status).toBe(403);
  });
});

describe('RBAC — No auth', () => {
  test('unauthenticated request to protected endpoint returns 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('health endpoint is public', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});
