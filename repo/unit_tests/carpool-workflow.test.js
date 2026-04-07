const request = require('supertest');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cineride_test';

let app, userToken, dispatcherToken;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-carpool';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = MONGO_URI;

  await mongoose.connect(MONGO_URI);
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const ConfigDictionary = require('../api/src/models/ConfigDictionary');
  const { hashPassword } = require('../api/src/utils/crypto');

  await User.deleteMany({ username: /^cp_/ });

  await ConfigDictionary.findOneAndUpdate(
    { key: 'auto_cancel_minutes' }, { key: 'auto_cancel_minutes', value: 30, category: 'thresholds' }, { upsert: true }
  );
  await ConfigDictionary.findOneAndUpdate(
    { key: 'free_cancel_window_minutes' }, { key: 'free_cancel_window_minutes', value: 5, category: 'thresholds' }, { upsert: true }
  );
  await ConfigDictionary.findOneAndUpdate(
    { key: 'min_ride_advance_minutes' }, { key: 'min_ride_advance_minutes', value: 5, category: 'thresholds' }, { upsert: true }
  );

  await User.create({ username: 'cp_user', password_hash: await hashPassword('Test1234!'), role: 'regular_user', display_name: 'CP User' });
  await User.create({ username: 'cp_disp', password_hash: await hashPassword('Test1234!'), role: 'dispatcher', display_name: 'CP Disp' });

  let res;
  res = await request(app).post('/api/auth/login').send({ username: 'cp_user', password: 'Test1234!' });
  userToken = res.body.token;
  res = await request(app).post('/api/auth/login').send({ username: 'cp_disp', password: 'Test1234!' });
  dispatcherToken = res.body.token;
});

afterAll(async () => {
  const User = require('../api/src/models/User');
  await User.deleteMany({ username: /^cp_/ });
  await mongoose.disconnect();
});

function futureWindow(offsetMs = 600000) {
  const start = new Date(Date.now() + offsetMs);
  const end = new Date(start.getTime() + 3600000);
  return { time_window_start: start.toISOString(), time_window_end: end.toISOString() };
}

async function createCarpoolRide(riderCount = 1) {
  const tw = futureWindow();
  const res = await request(app).post('/api/rides')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      pickup_text: 'Pickup', dropoff_text: 'Dropoff',
      rider_count: riderCount, vehicle_type: 'sedan',
      is_carpool: true, ...tw
    });
  expect(res.status).toBe(201);
  return res.body.ride;
}

describe('Carpool Workflow — Ride Creation', () => {
  test('carpool ride is created with is_carpool=true', async () => {
    const ride = await createCarpoolRide();
    expect(ride.is_carpool).toBe(true);
    expect(ride.status).toBe('pending_match');
  });

  test('non-carpool ride has is_carpool=false', async () => {
    const tw = futureWindow();
    const res = await request(app).post('/api/rides')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ pickup_text: 'A', dropoff_text: 'B', rider_count: 1, ...tw });
    expect(res.status).toBe(201);
    expect(res.body.ride.is_carpool).toBe(false);
  });
});

describe('Carpool Workflow — Candidate Matching', () => {
  test('getCarpoolCandidates returns matching rides', async () => {
    const ride1 = await createCarpoolRide();
    const ride2 = await createCarpoolRide();

    const res = await request(app)
      .get(`/api/dispatch/carpool/candidates/${ride1._id}`)
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(200);
    const candidateIds = res.body.candidates.map(c => c._id);
    expect(candidateIds).toContain(ride2._id);
  });

  test('non-carpool ride returns 422 for candidates', async () => {
    const tw = futureWindow();
    const rideRes = await request(app).post('/api/rides')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ pickup_text: 'X', dropoff_text: 'Y', rider_count: 1, ...tw });
    const nonCarpoolId = rideRes.body.ride._id;

    const res = await request(app)
      .get(`/api/dispatch/carpool/candidates/${nonCarpoolId}`)
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(422);
  });
});

describe('Carpool Workflow — Grouping Constraints', () => {
  test('grouping fewer than 2 rides fails (422)', async () => {
    const ride1 = await createCarpoolRide();
    const res = await request(app).post('/api/dispatch/carpool/group')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({ ride_ids: [ride1._id] });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('At least 2 rides');
  });

  test('grouping rides exceeding 6 total riders fails (422)', async () => {
    const ride1 = await createCarpoolRide(4);
    const ride2 = await createCarpoolRide(4);
    const res = await request(app).post('/api/dispatch/carpool/group')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({ ride_ids: [ride1._id, ride2._id] });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('exceeds maximum of 6');
  });

  test('grouping non-eligible rides (already accepted) fails', async () => {
    const ride1 = await createCarpoolRide();
    const ride2 = await createCarpoolRide();
    await request(app).post(`/api/dispatch/rides/${ride1._id}/accept`)
      .set('Authorization', `Bearer ${dispatcherToken}`).send({});

    const res = await request(app).post('/api/dispatch/carpool/group')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({ ride_ids: [ride1._id, ride2._id] });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('not eligible');
  });
});

describe('Carpool Workflow — Successful Grouping', () => {
  test('grouping 2 valid rides assigns group_id and transitions to accepted', async () => {
    const ride1 = await createCarpoolRide(2);
    const ride2 = await createCarpoolRide(2);

    const res = await request(app).post('/api/dispatch/carpool/group')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({ ride_ids: [ride1._id, ride2._id] });
    expect(res.status).toBe(201);
    expect(res.body.group_id).toBeDefined();
    expect(res.body.group_id).toMatch(/^carpool_/);
    expect(res.body.total_riders).toBe(4);

    const groupRes = await request(app)
      .get(`/api/dispatch/carpool/group/${res.body.group_id}`)
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(groupRes.status).toBe(200);
    expect(groupRes.body.rides).toHaveLength(2);
    for (const r of groupRes.body.rides) {
      expect(r.status).toBe('accepted');
      expect(r.carpool_group_id).toBe(res.body.group_id);
    }
  });
});
