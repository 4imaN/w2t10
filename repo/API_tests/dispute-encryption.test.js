const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../api/src/app');
const User = require('../api/src/models/User');
const RideRequest = require('../api/src/models/RideRequest');
const Dispute = require('../api/src/models/Dispute');
const ConfigDictionary = require('../api/src/models/ConfigDictionary');
const { hashPassword, decrypt } = require('../api/src/utils/crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let userToken, dispatcherToken;
let rideId;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  await User.deleteMany({});
  await RideRequest.deleteMany({});
  await Dispute.deleteMany({});

  await ConfigDictionary.findOneAndUpdate(
    { key: 'auto_cancel_minutes' }, { key: 'auto_cancel_minutes', value: 30, category: 'thresholds' }, { upsert: true }
  );
  await ConfigDictionary.findOneAndUpdate(
    { key: 'free_cancel_window_minutes' }, { key: 'free_cancel_window_minutes', value: 5, category: 'thresholds' }, { upsert: true }
  );
  await ConfigDictionary.findOneAndUpdate(
    { key: 'min_ride_advance_minutes' }, { key: 'min_ride_advance_minutes', value: 5, category: 'thresholds' }, { upsert: true }
  );
  await ConfigDictionary.findOneAndUpdate(
    { key: 'dispute_escalation_hours' }, { key: 'dispute_escalation_hours', value: 24, category: 'thresholds' }, { upsert: true }
  );

  await User.insertMany([
    { username: 'denc_user', password_hash: await hashPassword('Pass1234!'), role: 'regular_user', display_name: 'User' },
    { username: 'denc_disp', password_hash: await hashPassword('Pass1234!'), role: 'dispatcher', display_name: 'Disp' },
  ]);

  let res;
  res = await request(app).post('/api/auth/login').send({ username: 'denc_user', password: 'Pass1234!' });
  userToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'denc_disp', password: 'Pass1234!' });
  dispatcherToken = res.body.token;

  // Create and accept a ride
  const start = new Date(Date.now() + 600000);
  const end = new Date(start.getTime() + 3600000);
  res = await request(app).post('/api/rides')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ pickup_text: 'A', dropoff_text: 'B', rider_count: 1, time_window_start: start.toISOString(), time_window_end: end.toISOString() });
  rideId = res.body.ride._id;

  await request(app).post(`/api/dispatch/rides/${rideId}/accept`)
    .set('Authorization', `Bearer ${dispatcherToken}`).send({});
});

afterAll(async () => {
  await User.deleteMany({});
  await RideRequest.deleteMany({});
  await Dispute.deleteMany({});
  await mongoose.disconnect();
});

describe('Dispute Detail Encryption', () => {
  let disputeId;
  const SENSITIVE_DETAIL = 'The driver was rude and used threatening language at pickup';

  test('create dispute with detail — detail is encrypted at rest', async () => {
    const res = await request(app).post('/api/disputes')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ride_request: rideId, reason: 'service_complaint', detail: SENSITIVE_DETAIL });
    expect(res.status).toBe(201);
    disputeId = res.body.dispute._id;

    // Check the raw DB document — detail_encrypted should exist, not plaintext detail
    const raw = await Dispute.findById(disputeId).lean();
    expect(raw.detail_encrypted).toBeTruthy();
    expect(raw.detail_encrypted).not.toBe(SENSITIVE_DETAIL);
    // The encrypted field should be decryptable
    expect(decrypt(raw.detail_encrypted)).toBe(SENSITIVE_DETAIL);
    // No plaintext 'detail' field stored
    expect(raw.detail).toBeUndefined();
  });

  test('GET dispute detail returns decrypted detail for authorized users', async () => {
    const res = await request(app).get(`/api/dispatch/disputes/${disputeId}`)
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.dispute.detail).toBe(SENSITIVE_DETAIL);
  });

  test('dispute list returns decrypted detail', async () => {
    const res = await request(app).get('/api/dispatch/disputes')
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(200);
    const found = res.body.disputes.find(d => d._id === disputeId);
    expect(found).toBeTruthy();
    expect(found.detail).toBe(SENSITIVE_DETAIL);
  });

  test('dispute with empty detail stores null encryption', async () => {
    // Create another ride to dispute
    const start = new Date(Date.now() + 700000);
    const end = new Date(start.getTime() + 3600000);
    let res = await request(app).post('/api/rides')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ pickup_text: 'X', dropoff_text: 'Y', rider_count: 1, time_window_start: start.toISOString(), time_window_end: end.toISOString() });
    const rId = res.body.ride._id;
    await request(app).post(`/api/dispatch/rides/${rId}/accept`)
      .set('Authorization', `Bearer ${dispatcherToken}`).send({});

    res = await request(app).post('/api/disputes')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ride_request: rId, reason: 'no_show' });
    expect(res.status).toBe(201);

    const raw = await Dispute.findById(res.body.dispute._id).lean();
    expect(raw.detail_encrypted).toBeNull();
  });
});
