const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../api/src/app');
const User = require('../api/src/models/User');
const RideRequest = require('../api/src/models/RideRequest');
const ConfigDictionary = require('../api/src/models/ConfigDictionary');
const { hashPassword } = require('../api/src/utils/crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let userAToken, userBToken, dispatcherToken;
let userAId, userBId;
let rideByA;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  await User.deleteMany({});
  await RideRequest.deleteMany({});

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

  const [uA, uB] = await User.insertMany([
    { username: 'objauth_userA', password_hash: await hashPassword('Pass1234!'), role: 'regular_user', display_name: 'User A' },
    { username: 'objauth_userB', password_hash: await hashPassword('Pass1234!'), role: 'regular_user', display_name: 'User B' },
  ]);
  await User.create({ username: 'objauth_disp', password_hash: await hashPassword('Pass1234!'), role: 'dispatcher', display_name: 'Disp' });

  userAId = uA._id;
  userBId = uB._id;

  let res = await request(app).post('/api/auth/login').send({ username: 'objauth_userA', password: 'Pass1234!' });
  userAToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'objauth_userB', password: 'Pass1234!' });
  userBToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'objauth_disp', password: 'Pass1234!' });
  dispatcherToken = res.body.token;

  // User A creates a ride
  const start = new Date(Date.now() + 600000);
  const end = new Date(start.getTime() + 3600000);
  res = await request(app).post('/api/rides')
    .set('Authorization', `Bearer ${userAToken}`)
    .send({ pickup_text: 'A place', dropoff_text: 'B place', rider_count: 1, time_window_start: start.toISOString(), time_window_end: end.toISOString() });
  rideByA = res.body.ride;
});

afterAll(async () => {
  await User.deleteMany({});
  await RideRequest.deleteMany({});
  await mongoose.disconnect();
});

describe('Object-Level Authorization — Rides', () => {
  test('User A can read own ride', async () => {
    const res = await request(app).get(`/api/rides/${rideByA._id}`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ride._id).toBe(rideByA._id);
  });

  test('User B CANNOT read User A ride (403)', async () => {
    const res = await request(app).get(`/api/rides/${rideByA._id}`)
      .set('Authorization', `Bearer ${userBToken}`);
    expect(res.status).toBe(403);
  });

  test('Dispatcher CAN read User A ride', async () => {
    const res = await request(app).get(`/api/rides/${rideByA._id}`)
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(200);
  });

  test('User B CANNOT cancel User A ride (403)', async () => {
    const res = await request(app).post(`/api/rides/${rideByA._id}/cancel`)
      .set('Authorization', `Bearer ${userBToken}`);
    expect(res.status).toBe(403);
  });

  test('User A ride list only shows own rides', async () => {
    const res = await request(app).get('/api/rides')
      .set('Authorization', `Bearer ${userBToken}`);
    expect(res.status).toBe(200);
    // User B should see zero rides (only User A has rides)
    expect(res.body.rides.length).toBe(0);
  });
});

describe('Object-Level Authorization — Disputes', () => {
  let acceptedRideId;

  beforeAll(async () => {
    // Dispatcher accepts the ride so it can be disputed
    await request(app).post(`/api/dispatch/rides/${rideByA._id}/accept`)
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({ notes: 'test' });
    acceptedRideId = rideByA._id;
  });

  test('User A CAN dispute own ride', async () => {
    const res = await request(app).post('/api/disputes')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ ride_request: acceptedRideId, reason: 'no_show', detail: 'Driver did not show up' });
    expect(res.status).toBe(201);
  });

  test('User B CANNOT dispute User A ride (403)', async () => {
    // Create another ride for A, accept it, then have B try to dispute it
    const start = new Date(Date.now() + 700000);
    const end = new Date(start.getTime() + 3600000);
    const rideRes = await request(app).post('/api/rides')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ pickup_text: 'X', dropoff_text: 'Y', rider_count: 1, time_window_start: start.toISOString(), time_window_end: end.toISOString() });
    const newRideId = rideRes.body.ride._id;

    await request(app).post(`/api/dispatch/rides/${newRideId}/accept`)
      .set('Authorization', `Bearer ${dispatcherToken}`).send({});

    const res = await request(app).post('/api/disputes')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ ride_request: newRideId, reason: 'fare_dispute' });
    expect(res.status).toBe(403);
  });

  test('Dispatcher CAN dispute any ride', async () => {
    const start = new Date(Date.now() + 800000);
    const end = new Date(start.getTime() + 3600000);
    const rideRes = await request(app).post('/api/rides')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ pickup_text: 'P', dropoff_text: 'Q', rider_count: 1, time_window_start: start.toISOString(), time_window_end: end.toISOString() });
    const rId = rideRes.body.ride._id;

    await request(app).post(`/api/dispatch/rides/${rId}/accept`)
      .set('Authorization', `Bearer ${dispatcherToken}`).send({});

    const res = await request(app).post('/api/disputes')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({ ride_request: rId, reason: 'service_complaint' });
    expect(res.status).toBe(201);
  });
});
