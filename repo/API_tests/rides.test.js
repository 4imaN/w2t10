const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../api/src/app');
const User = require('../api/src/models/User');
const RideRequest = require('../api/src/models/RideRequest');
const ConfigDictionary = require('../api/src/models/ConfigDictionary');
const { hashPassword } = require('../api/src/utils/crypto');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let userToken, dispatcherToken;
let rideId;

beforeAll(async () => {
  await mongoose.connect(MONGO_URI);
  await User.deleteMany({});
  await RideRequest.deleteMany({});

  // Ensure config exists
  await ConfigDictionary.findOneAndUpdate(
    { key: 'auto_cancel_minutes' },
    { key: 'auto_cancel_minutes', value: 30, category: 'thresholds' },
    { upsert: true }
  );
  await ConfigDictionary.findOneAndUpdate(
    { key: 'free_cancel_window_minutes' },
    { key: 'free_cancel_window_minutes', value: 5, category: 'thresholds' },
    { upsert: true }
  );
  await ConfigDictionary.findOneAndUpdate(
    { key: 'min_ride_advance_minutes' },
    { key: 'min_ride_advance_minutes', value: 5, category: 'thresholds' },
    { upsert: true }
  );

  await User.insertMany([
    { username: 'rideuser', password_hash: await hashPassword('User1234!'), role: 'regular_user', display_name: 'Rider' },
    { username: 'ridedisp', password_hash: await hashPassword('Dispatch123!'), role: 'dispatcher', display_name: 'Dispatcher' }
  ]);

  let res = await request(app).post('/api/auth/login').send({ username: 'rideuser', password: 'User1234!' });
  userToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'ridedisp', password: 'Dispatch123!' });
  dispatcherToken = res.body.token;
});

afterAll(async () => {
  await User.deleteMany({});
  await RideRequest.deleteMany({});
  await mongoose.disconnect();
});

describe('Rides API', () => {
  test('POST /api/rides — create ride request', async () => {
    const start = new Date(Date.now() + 600000); // 10 min from now
    const end = new Date(start.getTime() + 3600000); // 1 hour window
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        pickup_text: 'Main Theater Lobby',
        dropoff_text: 'Downtown Station',
        rider_count: 3,
        time_window_start: start.toISOString(),
        time_window_end: end.toISOString(),
        vehicle_type: 'van'
      });
    expect(res.status).toBe(201);
    expect(res.body.ride.status).toBe('pending_match');
    expect(res.body.ride.rider_count).toBe(3);
    expect(res.body.ride.vehicle_type).toBe('van');
    expect(res.body.ride.auto_cancel_at).toBeTruthy();
    rideId = res.body.ride._id;
  });

  test('POST /api/rides — reject rider_count > 6', async () => {
    const start = new Date(Date.now() + 600000);
    const end = new Date(start.getTime() + 3600000);
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        pickup_text: 'A', dropoff_text: 'B', rider_count: 10,
        time_window_start: start.toISOString(), time_window_end: end.toISOString()
      });
    expect(res.status).toBe(422);
  });

  test('POST /api/rides — reject time window > 4 hours', async () => {
    const start = new Date(Date.now() + 600000);
    const end = new Date(start.getTime() + 5 * 3600000); // 5 hours
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        pickup_text: 'A', dropoff_text: 'B', rider_count: 1,
        time_window_start: start.toISOString(), time_window_end: end.toISOString()
      });
    expect(res.status).toBe(422);
  });

  test('GET /api/rides — list rides', async () => {
    const res = await request(app)
      .get('/api/rides')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rides.length).toBeGreaterThan(0);
  });

  test('POST /api/dispatch/rides/:id/accept — dispatcher accepts', async () => {
    const res = await request(app)
      .post(`/api/dispatch/rides/${rideId}/accept`)
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({ notes: 'Driver assigned: Vehicle 42' });
    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('accepted');
  });

  test('POST /api/dispatch/rides/:id/transition — start ride', async () => {
    const res = await request(app)
      .post(`/api/dispatch/rides/${rideId}/transition`)
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({ to_status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('in_progress');
  });

  test('POST /api/dispatch/rides/:id/transition — complete ride', async () => {
    const res = await request(app)
      .post(`/api/dispatch/rides/${rideId}/transition`)
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({ to_status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('completed');
  });

  test('GET /api/rides/:id — has state transition log', async () => {
    const res = await request(app)
      .get(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ride.state_transitions.length).toBeGreaterThanOrEqual(3);
  });

  test('POST /api/rides/:id/feedback — rider submits feedback', async () => {
    const res = await request(app)
      .post(`/api/rides/${rideId}/feedback`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ rating: 5, comment: 'Great ride!' });
    expect(res.status).toBe(200);
    expect(res.body.ride.feedback.rating).toBe(5);
  });
});
