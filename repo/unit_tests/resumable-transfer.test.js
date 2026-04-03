const fs = require('fs');
const path = require('path');

describe('Sensor Resumable Transfer — Durable Persistence', () => {
  const modelFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'models', 'BatchSession.js'), 'utf-8'
  );
  const serviceFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'services', 'sensor.service.js'), 'utf-8'
  );

  test('BatchSession model exists with required fields', () => {
    expect(modelFile).toContain('session_id');
    expect(modelFile).toContain('device_id');
    expect(modelFile).toContain('processed');
    expect(modelFile).toContain('expires_at');
  });

  test('BatchSession has TTL index for auto-cleanup', () => {
    expect(modelFile).toContain('expireAfterSeconds: 0');
  });

  test('BatchSession has unique index on session_id', () => {
    expect(modelFile).toContain('unique: true');
  });

  test('service imports BatchSession model', () => {
    expect(serviceFile).toContain("require('../models/BatchSession')");
  });

  test('service does NOT use in-memory Map for sessions', () => {
    expect(serviceFile).not.toContain('new Map()');
    expect(serviceFile).not.toContain('batchSessions = new Map');
  });

  test('service uses findOneAndUpdate for durable session progress', () => {
    expect(serviceFile).toContain('BatchSession.findOneAndUpdate');
    expect(serviceFile).toContain('upsert: true');
  });

  test('service reads session from DB on resume', () => {
    expect(serviceFile).toContain('BatchSession.findOne');
    expect(serviceFile).toContain('session.processed');
  });
});
