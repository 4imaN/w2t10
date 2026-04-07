const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app, editorToken;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-upload';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;
  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const { hashPassword } = require('../api/src/utils/crypto');
  await User.deleteMany({ username: 'iup_editor' });
  await User.create({
    username: 'iup_editor',
    password_hash: await hashPassword('Test1234!'),
    role: 'editor',
    display_name: 'IUP Editor'
  });
  const res = await request(app).post('/api/auth/login')
    .send({ username: 'iup_editor', password: 'Test1234!' });
  editorToken = res.body.token;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  await User.deleteMany({ username: 'iup_editor' });
  await mongoose.disconnect();
});

describe('Movie Import Upload Path', () => {
  test('upload endpoint accepts JSON file and creates import job', async () => {
    const tmpFile = path.join(__dirname, '..', 'uploads', 'test-import.json');
    const dir = path.dirname(tmpFile);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpFile, JSON.stringify([{ title: 'Upload Test Movie' }]));

    const res = await request(app)
      .post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${editorToken}`)
      .attach('file', tmpFile);

    expect(res.status).toBe(201);
    expect(res.body.job).toBeDefined();
    expect(res.body.job.records).toHaveLength(1);

    fs.unlinkSync(tmpFile);
    const MovieImportJob = require('../api/src/models/MovieImportJob');
    await MovieImportJob.deleteOne({ _id: res.body.job._id });
  });

  test('upload endpoint accepts CSV file', async () => {
    const tmpFile = path.join(__dirname, '..', 'uploads', 'test-import.csv');
    fs.writeFileSync(tmpFile, 'title,mpaa_rating\nCSV Movie,PG\n');

    const res = await request(app)
      .post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${editorToken}`)
      .attach('file', tmpFile);

    expect(res.status).toBe(201);
    expect(res.body.job.records).toHaveLength(1);
    const record = res.body.job.records[0];
    expect(record.imported_data.title).toBe('CSV Movie');

    fs.unlinkSync(tmpFile);
    const MovieImportJob = require('../api/src/models/MovieImportJob');
    await MovieImportJob.deleteOne({ _id: res.body.job._id });
  });

  test('upload rejects unsupported file formats (422)', async () => {
    const tmpFile = path.join(__dirname, '..', 'uploads', 'test-import.xml');
    fs.writeFileSync(tmpFile, '<root><movie>Bad</movie></root>');

    const res = await request(app)
      .post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${editorToken}`)
      .attach('file', tmpFile);

    expect(res.status).toBe(422);
    fs.unlinkSync(tmpFile);
  });

  test('upload without file returns 422', async () => {
    const res = await request(app)
      .post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(422);
  });

  test('non-staff user cannot upload (403)', async () => {
    const User = require('../api/src/models/User');
    const { hashPassword } = require('../api/src/utils/crypto');
    await User.deleteMany({ username: 'iup_regular' });
    await User.create({
      username: 'iup_regular',
      password_hash: await hashPassword('Test1234!'),
      role: 'regular_user',
      display_name: 'Regular'
    });
    const loginRes = await request(app).post('/api/auth/login')
      .send({ username: 'iup_regular', password: 'Test1234!' });

    const res = await request(app)
      .post('/api/movie-import/upload')
      .set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(403);

    await User.deleteMany({ username: 'iup_regular' });
  });
});
