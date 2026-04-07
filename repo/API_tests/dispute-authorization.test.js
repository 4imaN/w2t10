const request = require('supertest');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app;
let adminToken, dispatcherAToken, dispatcherBToken, userToken;
let disputeId, rideId;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-dispute-auth';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;

  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const ConfigDictionary = require('../api/src/models/ConfigDictionary');
  const { hashPassword } = require('../api/src/utils/crypto');


  await User.deleteMany({ username: /^da_/ });


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

  await User.create({ username: 'da_admin', password_hash: await hashPassword('Pass1234!'), role: 'administrator', display_name: 'Admin' });
  await User.create({ username: 'da_dispA', password_hash: await hashPassword('Pass1234!'), role: 'dispatcher', display_name: 'Dispatcher A' });
  await User.create({ username: 'da_dispB', password_hash: await hashPassword('Pass1234!'), role: 'dispatcher', display_name: 'Dispatcher B' });
  await User.create({ username: 'da_user', password_hash: await hashPassword('Pass1234!'), role: 'regular_user', display_name: 'User' });

  let res;
  res = await request(app).post('/api/auth/login').send({ username: 'da_admin', password: 'Pass1234!' });
  adminToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'da_dispA', password: 'Pass1234!' });
  dispatcherAToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'da_dispB', password: 'Pass1234!' });
  dispatcherBToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'da_user', password: 'Pass1234!' });
  userToken = res.body.token;


  const start = new Date(Date.now() + 600000);
  const end = new Date(start.getTime() + 3600000);
  res = await request(app).post('/api/rides')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ pickup_text: 'Here', dropoff_text: 'There', rider_count: 1, time_window_start: start.toISOString(), time_window_end: end.toISOString() });
  rideId = res.body.ride._id;

  await request(app).post(`/api/dispatch/rides/${rideId}/accept`)
    .set('Authorization', `Bearer ${dispatcherAToken}`).send({});


  res = await request(app).post('/api/disputes')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ ride_request: rideId, reason: 'fare_dispute', detail: 'Overcharged' });
  disputeId = res.body.dispute._id;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  await User.deleteMany({ username: /^da_/ });
  await mongoose.disconnect();
});

describe('Dispute Object-Level Authorization', () => {
  test('Dispatcher A can assign dispute to self', async () => {
    const res = await request(app)
      .post(`/api/dispatch/disputes/${disputeId}/assign`)
      .set('Authorization', `Bearer ${dispatcherAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.dispute.status).toBe('investigating');
  });

  test('Dispatcher B (non-assigned) CANNOT resolve the dispute (403)', async () => {
    const res = await request(app)
      .post(`/api/dispatch/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${dispatcherBToken}`)
      .send({ resolution: 'no_action', notes: 'Trying to resolve' });
    expect(res.status).toBe(403);
  });

  test('Dispatcher B CANNOT reassign the dispute (403)', async () => {
    const res = await request(app)
      .post(`/api/dispatch/disputes/${disputeId}/assign`)
      .set('Authorization', `Bearer ${dispatcherBToken}`);
    expect(res.status).toBe(403);
  });

  test('Assigned dispatcher (A) CAN resolve the dispute', async () => {
    const res = await request(app)
      .post(`/api/dispatch/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${dispatcherAToken}`)
      .send({ resolution: 'no_action', notes: 'Resolved by assigned' });
    expect(res.status).toBe(200);
    expect(res.body.dispute.status).toBe('resolved');
  });

  test('Admin can resolve any dispute (override)', async () => {

    const start = new Date(Date.now() + 900000);
    const end = new Date(start.getTime() + 3600000);
    let res = await request(app).post('/api/rides')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ pickup_text: 'X', dropoff_text: 'Y', rider_count: 1, time_window_start: start.toISOString(), time_window_end: end.toISOString() });
    const newRideId = res.body.ride._id;

    await request(app).post(`/api/dispatch/rides/${newRideId}/accept`)
      .set('Authorization', `Bearer ${dispatcherAToken}`).send({});

    res = await request(app).post('/api/disputes')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ride_request: newRideId, reason: 'no_show' });
    const newDisputeId = res.body.dispute._id;


    await request(app).post(`/api/dispatch/disputes/${newDisputeId}/assign`)
      .set('Authorization', `Bearer ${dispatcherAToken}`);


    res = await request(app)
      .post(`/api/dispatch/disputes/${newDisputeId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'resolved_in_favor_of_rider', notes: 'Admin override' });
    expect(res.status).toBe(200);
    expect(res.body.dispute.resolution).toBe('resolved_in_favor_of_rider');
  });
});
