'use strict';

/**
 * service-extended.test.js
 *
 * Extended unit tests for five backend services that are not covered by
 * service-logic.test.js:
 *
 *   1. user.service.js
 *   2. movie.service.js
 *   3. dispute.service.js
 *   4. sensor.service.js
 *   5. search.service.js
 *
 * Uses mongodb-memory-server for a real (but in-memory) Mongoose store.
 */

// ── env bootstrap (must happen before any service or model import) ────────────
process.env.JWT_SECRET = 'test-service-ext';
process.env.ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await mongoose.connect(mongod.getUri());
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}, 15000);

afterEach(async () => {
  const colls = mongoose.connection.collections;
  for (const key in colls) await colls[key].deleteMany({});
  // Force config cache to expire between tests so stale entries do not leak
  const configService = require('../api/src/services/config.service');
  await configService.refreshCache();
});

// ── shared helpers ────────────────────────────────────────────────────────────

const { hashPassword } = require('../api/src/utils/crypto');
const User = require('../api/src/models/User');
const ConfigDictionary = require('../api/src/models/ConfigDictionary');
const RideRequest = require('../api/src/models/RideRequest');
const Movie = require('../api/src/models/Movie');
const ContentItem = require('../api/src/models/ContentItem');
const SensorDevice = require('../api/src/models/SensorDevice');

async function makeUser(overrides = {}) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return User.create({
    username: overrides.username || `user_${suffix}`,
    password_hash: await hashPassword('Pass1234!'),
    role: 'regular_user',
    display_name: 'Test User',
    status: 'active',
    ...overrides
  });
}

async function seedBaseConfigs() {
  const entries = [
    { key: 'auto_cancel_minutes', value: 30, category: 'thresholds' },
    { key: 'free_cancel_window_minutes', value: 5, category: 'thresholds' },
    { key: 'min_ride_advance_minutes', value: 5, category: 'thresholds' },
    { key: 'dispute_escalation_hours', value: 24, category: 'thresholds' },
    { key: 'sensor_retention_days', value: 180, category: 'thresholds' },
    { key: 'time_drift_threshold_seconds', value: 300, category: 'thresholds' }
  ];
  await ConfigDictionary.insertMany(entries);
  const configService = require('../api/src/services/config.service');
  await configService.refreshCache();
}

function futureWindow(offsetMs = 600000) {
  const start = new Date(Date.now() + offsetMs);
  const end = new Date(start.getTime() + 3600000);
  return {
    time_window_start: start.toISOString(),
    time_window_end: end.toISOString()
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. USER SERVICE
// ════════════════════════════════════════════════════════════════════════════

describe('user.service — createUser()', () => {
  const userService = require('../api/src/services/user.service');

  test('creates a user and returns sanitized object without password_hash', async () => {
    const result = await userService.createUser({
      username: 'alice',
      password: 'Pass1234!',
      role: 'regular_user',
      display_name: 'Alice'
    });
    expect(result.username).toBe('alice');
    expect(result.password_hash).toBeUndefined();
    expect(result._id).toBeDefined();
  });

  test('returned object does not contain phone_encrypted field', async () => {
    const result = await userService.createUser({
      username: 'bob',
      password: 'Pass1234!',
      role: 'regular_user',
      phone: '4155551234'
    });
    expect(result.phone_encrypted).toBeUndefined();
  });

  test('rejects duplicate username with ConflictError', async () => {
    await userService.createUser({
      username: 'dup_user',
      password: 'Pass1234!',
      role: 'regular_user'
    });
    await expect(
      userService.createUser({
        username: 'dup_user',
        password: 'Pass9999!',
        role: 'regular_user'
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('user.service — getUsers()', () => {
  const userService = require('../api/src/services/user.service');

  beforeEach(async () => {
    await userService.createUser({ username: 'u_admin_1', password: 'Pass1234!', role: 'administrator' });
    await userService.createUser({ username: 'u_editor_1', password: 'Pass1234!', role: 'editor' });
    await userService.createUser({ username: 'u_reg_1', password: 'Pass1234!', role: 'regular_user' });
    await userService.createUser({ username: 'u_reg_2', password: 'Pass1234!', role: 'regular_user' });
  });

  test('returns paginated results with total/page/pages fields', async () => {
    const result = await userService.getUsers({}, 1, 10);
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('page', 1);
    expect(result).toHaveProperty('pages');
    expect(result.users).toBeInstanceOf(Array);
    expect(result.total).toBeGreaterThanOrEqual(4);
  });

  test('filters results by role', async () => {
    const result = await userService.getUsers({ role: 'editor' }, 1, 20);
    expect(result.users.length).toBeGreaterThanOrEqual(1);
    result.users.forEach(u => expect(u.role).toBe('editor'));
  });

  test('searches users by username substring', async () => {
    const result = await userService.getUsers({ search: 'u_reg' }, 1, 20);
    expect(result.users.length).toBeGreaterThanOrEqual(2);
    result.users.forEach(u =>
      expect(u.username.toLowerCase()).toContain('u_reg')
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('user.service — getUserById()', () => {
  const userService = require('../api/src/services/user.service');

  test('returns sanitized user for a valid id', async () => {
    const created = await userService.createUser({
      username: 'find_me',
      password: 'Pass1234!',
      role: 'regular_user'
    });
    const found = await userService.getUserById(created._id);
    expect(found.username).toBe('find_me');
    expect(found.password_hash).toBeUndefined();
  });

  test('throws NotFoundError for a non-existent id', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await expect(userService.getUserById(fakeId)).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('user.service — updateUser()', () => {
  const userService = require('../api/src/services/user.service');

  test('updates role and display_name', async () => {
    const user = await userService.createUser({
      username: 'upd_user',
      password: 'Pass1234!',
      role: 'regular_user'
    });
    const updated = await userService.updateUser(user._id, {
      role: 'editor',
      display_name: 'New Name'
    });
    expect(updated.role).toBe('editor');
    expect(updated.display_name).toBe('New Name');
  });

  test('rejects a password shorter than 8 characters with ValidationError', async () => {
    const user = await userService.createUser({
      username: 'pw_short_user',
      password: 'Pass1234!',
      role: 'regular_user'
    });
    await expect(
      userService.updateUser(user._id, { password: 'short' })
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test('encrypts phone and does not expose raw phone in returned object', async () => {
    const user = await userService.createUser({
      username: 'phone_user',
      password: 'Pass1234!',
      role: 'regular_user'
    });
    const updated = await userService.updateUser(user._id, { phone: '4155559876' });
    // phone_encrypted must not be exposed
    expect(updated.phone_encrypted).toBeUndefined();
    // phone should be masked, not the raw value
    expect(updated.phone).not.toBe('4155559876');
    // masked value should contain asterisks
    expect(updated.phone).toMatch(/\*+/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('user.service — deleteUser()', () => {
  const userService = require('../api/src/services/user.service');

  test('soft-deletes a user by setting deleted_at', async () => {
    const user = await userService.createUser({
      username: 'to_delete',
      password: 'Pass1234!',
      role: 'regular_user'
    });
    await userService.deleteUser(user._id);
    const raw = await User.findById(user._id);
    expect(raw.deleted_at).not.toBeNull();
  });

  test('throws NotFoundError for an already-deleted or non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await expect(userService.deleteUser(fakeId)).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('user.service — sanitizeUser()', () => {
  const userService = require('../api/src/services/user.service');

  test('strips password_hash and phone_encrypted and masks phone', async () => {
    const raw = await User.create({
      username: 'san_user',
      password_hash: 'some_hash',
      role: 'regular_user',
      display_name: 'San',
      phone_encrypted: null
    });
    const sanitized = userService.sanitizeUser(raw);
    expect(sanitized.password_hash).toBeUndefined();
    expect(sanitized.phone_encrypted).toBeUndefined();
    // __v should be stripped
    expect(sanitized.__v).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. MOVIE SERVICE
// ════════════════════════════════════════════════════════════════════════════

describe('movie.service — createMovie()', () => {
  const movieService = require('../api/src/services/movie.service');
  let userId;

  beforeEach(async () => {
    const u = await makeUser({ username: `mv_creator_${Date.now()}`, role: 'editor' });
    userId = u._id;
  });

  test('creates a movie with an initial revision snapshot', async () => {
    const movie = await movieService.createMovie(
      { title: 'First Film', description: 'Desc', categories: ['drama'], tags: ['classic'] },
      userId
    );
    expect(movie.title).toBe('First Film');
    expect(movie.revisions).toHaveLength(1);
    expect(movie.revisions[0].change_type).toBe('create');
  });

  test('newly created movie has is_published=true by default', async () => {
    const movie = await movieService.createMovie(
      { title: 'Auto Published' },
      userId
    );
    expect(movie.is_published).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('movie.service — getMovies()', () => {
  const movieService = require('../api/src/services/movie.service');
  let userId;

  beforeEach(async () => {
    const u = await makeUser({ username: `mv_list_${Date.now()}`, role: 'editor' });
    userId = u._id;
    await movieService.createMovie({ title: 'Published One' }, userId);
    const m2 = await movieService.createMovie({ title: 'Published Two' }, userId);
    await movieService.unpublishMovie(m2._id, userId);
  });

  test('returns paginated results with total/page/pages', async () => {
    const result = await movieService.getMovies({}, 1, 10, true);
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('page', 1);
    expect(result).toHaveProperty('pages');
    expect(result.movies).toBeInstanceOf(Array);
  });

  test('excludes unpublished movies when includeUnpublished=false', async () => {
    const result = await movieService.getMovies({}, 1, 20, false);
    result.movies.forEach(m => expect(m.is_published).toBe(true));
  });

  test('includes unpublished movies when includeUnpublished=true', async () => {
    const result = await movieService.getMovies({}, 1, 20, true);
    const hasUnpublished = result.movies.some(m => m.is_published === false);
    expect(hasUnpublished).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('movie.service — getMovieById()', () => {
  const movieService = require('../api/src/services/movie.service');
  let userId;

  beforeEach(async () => {
    const u = await makeUser({ username: `mv_byid_${Date.now()}`, role: 'editor' });
    userId = u._id;
  });

  test('throws NotFoundError for a missing movie id', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await expect(movieService.getMovieById(fakeId)).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('movie.service — updateMovie()', () => {
  const movieService = require('../api/src/services/movie.service');
  let userId;

  beforeEach(async () => {
    const u = await makeUser({ username: `mv_upd_${Date.now()}`, role: 'editor' });
    userId = u._id;
  });

  test('updates title and creates an edit revision', async () => {
    const movie = await movieService.createMovie({ title: 'Original Title' }, userId);
    const initialRevCount = movie.revisions.length;
    const updated = await movieService.updateMovie(
      movie._id,
      { title: 'Updated Title' },
      userId
    );
    expect(updated.title).toBe('Updated Title');
    expect(updated.revisions.length).toBe(initialRevCount + 1);
    expect(updated.revisions[updated.revisions.length - 1].change_type).toBe('edit');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('movie.service — unpublishMovie() / republishMovie()', () => {
  const movieService = require('../api/src/services/movie.service');
  let userId;

  beforeEach(async () => {
    const u = await makeUser({ username: `mv_pub_${Date.now()}`, role: 'editor' });
    userId = u._id;
  });

  test('unpublishMovie sets is_published=false and records unpublish revision', async () => {
    const movie = await movieService.createMovie({ title: 'To Unpublish' }, userId);
    const updated = await movieService.unpublishMovie(movie._id, userId);
    expect(updated.is_published).toBe(false);
    const lastRev = updated.revisions[updated.revisions.length - 1];
    expect(lastRev.change_type).toBe('unpublish');
  });

  test('republishMovie sets is_published=true and records republish revision', async () => {
    const movie = await movieService.createMovie({ title: 'To Republish' }, userId);
    await movieService.unpublishMovie(movie._id, userId);
    const updated = await movieService.republishMovie(movie._id, userId);
    expect(updated.is_published).toBe(true);
    const lastRev = updated.revisions[updated.revisions.length - 1];
    expect(lastRev.change_type).toBe('republish');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('movie.service — deleteMovie()', () => {
  const movieService = require('../api/src/services/movie.service');
  let userId;

  beforeEach(async () => {
    const u = await makeUser({ username: `mv_del_${Date.now()}`, role: 'editor' });
    userId = u._id;
  });

  test('soft-deletes a movie by setting deleted_at', async () => {
    const movie = await movieService.createMovie({ title: 'To Delete' }, userId);
    await movieService.deleteMovie(movie._id);
    const raw = await Movie.findById(movie._id);
    expect(raw.deleted_at).not.toBeNull();
  });

  test('throws NotFoundError for a missing movie', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await expect(movieService.deleteMovie(fakeId)).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('movie.service — getRevisionHistory()', () => {
  const movieService = require('../api/src/services/movie.service');
  let userId;

  beforeEach(async () => {
    const u = await makeUser({ username: `mv_rev_${Date.now()}`, role: 'editor' });
    userId = u._id;
  });

  test('returns revision array for a movie', async () => {
    const movie = await movieService.createMovie({ title: 'Rev Movie' }, userId);
    await movieService.updateMovie(movie._id, { title: 'Rev Movie Updated' }, userId);
    const revisions = await movieService.getRevisionHistory(movie._id);
    expect(Array.isArray(revisions)).toBe(true);
    expect(revisions.length).toBeGreaterThanOrEqual(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. DISPUTE SERVICE
// ════════════════════════════════════════════════════════════════════════════

describe('dispute.service', () => {
  const disputeService = require('../api/src/services/dispute.service');
  const rideService = require('../api/src/services/ride.service');

  let requesterId, dispatcherId, adminId, acceptedRide;

  beforeEach(async () => {
    await seedBaseConfigs();

    const reqUser = await makeUser({
      username: `disp_req_${Date.now()}`,
      role: 'regular_user'
    });
    const dispUser = await makeUser({
      username: `disp_disp_${Date.now()}`,
      role: 'dispatcher'
    });
    const adminUser = await makeUser({
      username: `disp_admin_${Date.now()}`,
      role: 'administrator'
    });
    requesterId = reqUser._id;
    dispatcherId = dispUser._id;
    adminId = adminUser._id;

    // Create a ride in 'pending_match' then accept it
    const tw = futureWindow();
    const ride = await rideService.createRideRequest(
      {
        pickup_text: 'Airport',
        dropoff_text: 'Hotel',
        rider_count: 1,
        ...tw
      },
      requesterId
    );
    acceptedRide = await rideService.acceptRide(ride._id, dispatcherId);
  });

  test('createDispute creates a dispute and transitions ride to in_dispute', async () => {
    const dispute = await disputeService.createDispute(
      { ride_request: acceptedRide._id, reason: 'fare_dispute', detail: 'Charged too much' },
      requesterId,
      'regular_user'
    );
    expect(dispute).toBeDefined();
    expect(dispute.status).toBe('open');
    expect(dispute.reason).toBe('fare_dispute');

    // Ride must now be in_dispute
    const rideNow = await RideRequest.findById(acceptedRide._id);
    expect(rideNow.status).toBe('in_dispute');
  });

  test('createDispute rejects a dispute on a ride in pending_match status', async () => {
    // Create a brand-new ride (stays pending_match)
    const tw = futureWindow(700000);
    const pendingRide = await rideService.createRideRequest(
      { pickup_text: 'A', dropoff_text: 'B', rider_count: 1, ...tw },
      requesterId
    );
    await expect(
      disputeService.createDispute(
        { ride_request: pendingRide._id, reason: 'no_show' },
        requesterId,
        'regular_user'
      )
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test('createDispute rejects when a non-owner tries to dispute another user\'s ride', async () => {
    const otherUser = await makeUser({
      username: `other_${Date.now()}`,
      role: 'regular_user'
    });
    await expect(
      disputeService.createDispute(
        { ride_request: acceptedRide._id, reason: 'no_show' },
        otherUser._id,
        'regular_user'
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('getDisputes returns paginated results with populated fields', async () => {
    await disputeService.createDispute(
      { ride_request: acceptedRide._id, reason: 'other' },
      requesterId,
      'regular_user'
    );
    const result = await disputeService.getDisputes({}, 1, 20);
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('page', 1);
    expect(result.disputes).toBeInstanceOf(Array);
    expect(result.disputes.length).toBeGreaterThanOrEqual(1);
    // populated ride_request should be an object (or ObjectId if no match)
    const d = result.disputes[0];
    expect(d.ride_request).toBeDefined();
  });

  test('assignDispute sets assigned_dispatcher and status=investigating', async () => {
    const dispute = await disputeService.createDispute(
      { ride_request: acceptedRide._id, reason: 'wrong_route' },
      requesterId,
      'regular_user'
    );
    const assigned = await disputeService.assignDispute(
      dispute._id,
      dispatcherId,
      'dispatcher'
    );
    expect(assigned.status).toBe('investigating');
    expect(assigned.assigned_dispatcher.toString()).toBe(dispatcherId.toString());
  });

  test('resolveDispute with resolved_in_favor_of_rider cancels the ride', async () => {
    const dispute = await disputeService.createDispute(
      { ride_request: acceptedRide._id, reason: 'service_complaint' },
      requesterId,
      'regular_user'
    );
    await disputeService.assignDispute(dispute._id, dispatcherId, 'dispatcher');
    await disputeService.resolveDispute(
      dispute._id,
      dispatcherId,
      'resolved_in_favor_of_rider',
      'Rider was correct',
      'dispatcher'
    );
    const rideNow = await RideRequest.findById(acceptedRide._id);
    expect(rideNow.status).toBe('canceled');
  });

  test('resolveDispute with no_action completes the ride', async () => {
    // Use a second ride for this test
    const tw = futureWindow(800000);
    const r2 = await rideService.createRideRequest(
      { pickup_text: 'X', dropoff_text: 'Y', rider_count: 1, ...tw },
      requesterId
    );
    const acceptedR2 = await rideService.acceptRide(r2._id, dispatcherId);
    const dispute = await disputeService.createDispute(
      { ride_request: acceptedR2._id, reason: 'fare_dispute' },
      requesterId,
      'regular_user'
    );
    await disputeService.assignDispute(dispute._id, dispatcherId, 'dispatcher');
    await disputeService.resolveDispute(
      dispute._id,
      dispatcherId,
      'no_action',
      null,
      'dispatcher'
    );
    const rideNow = await RideRequest.findById(acceptedR2._id);
    expect(rideNow.status).toBe('completed');
  });

  test('resolveDispute throws ForbiddenError when dispute is not yet assigned', async () => {
    const dispute = await disputeService.createDispute(
      { ride_request: acceptedRide._id, reason: 'no_show' },
      requesterId,
      'regular_user'
    );
    // Dispute is open but unassigned; non-admin tries to resolve
    await expect(
      disputeService.resolveDispute(
        dispute._id,
        dispatcherId,
        'no_action',
        null,
        'dispatcher'
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. SENSOR SERVICE
// ════════════════════════════════════════════════════════════════════════════

describe('sensor.service — createDevice() / getDevices()', () => {
  const sensorService = require('../api/src/services/sensor.service');

  beforeEach(async () => {
    await seedBaseConfigs();
  });

  test('createDevice creates a sensor device record', async () => {
    const device = await sensorService.createDevice({
      device_id: `dev_create_${Date.now()}`,
      label: 'Temp Sensor A',
      unit: 'C',
      range_min: -40,
      range_max: 85
    });
    expect(device.device_id).toMatch(/^dev_create_/);
    expect(device.label).toBe('Temp Sensor A');
  });

  test('getDevices returns all non-deleted devices without secret_hash', async () => {
    await sensorService.createDevice({
      device_id: `dev_list_${Date.now()}`,
      label: 'List Sensor',
      unit: 'C'
    });
    const devices = await sensorService.getDevices();
    expect(Array.isArray(devices)).toBe(true);
    expect(devices.length).toBeGreaterThanOrEqual(1);
    devices.forEach(d => expect(d.secret_hash).toBeUndefined());
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('sensor.service — ingestReading()', () => {
  const sensorService = require('../api/src/services/sensor.service');
  let device;

  beforeEach(async () => {
    await seedBaseConfigs();
    device = await sensorService.createDevice({
      device_id: `dev_ingest_${Date.now()}`,
      label: 'Ingest Sensor',
      unit: 'C',
      range_min: 0,
      range_max: 100
    });
  });

  test('ingestReading creates both raw and cleaned reading records', async () => {
    const SensorReading = require('../api/src/models/SensorReading');
    const ts = new Date();
    await sensorService.ingestReading({
      device_id: device.device_id,
      timestamp: ts.toISOString(),
      value: 25,
      unit: 'C'
    });
    const rawCount = await SensorReading.countDocuments({ device_id: device.device_id, is_raw: true });
    const cleanCount = await SensorReading.countDocuments({ device_id: device.device_id, is_cleaned: true });
    expect(rawCount).toBe(1);
    expect(cleanCount).toBe(1);
  });

  test('ingestReading throws NotFoundError for an unknown device_id', async () => {
    await expect(
      sensorService.ingestReading({
        device_id: 'nonexistent_device_xyz',
        timestamp: new Date().toISOString(),
        value: 42
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('ingestReading detects duplicate reading (same device + timestamp)', async () => {
    const ts = new Date();
    await sensorService.ingestReading({
      device_id: device.device_id,
      timestamp: ts.toISOString(),
      value: 30
    });
    await expect(
      sensorService.ingestReading({
        device_id: device.device_id,
        timestamp: ts.toISOString(),
        value: 30
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('ingestReading flags range outlier when value is outside range_min/range_max', async () => {
    const SensorReading = require('../api/src/models/SensorReading');
    const ts = new Date(Date.now() + 1000); // offset to avoid duplicate clash
    await sensorService.ingestReading({
      device_id: device.device_id,
      timestamp: ts.toISOString(),
      value: 200 // above range_max of 100
    });
    const raw = await SensorReading.findOne({ device_id: device.device_id, is_raw: true });
    expect(raw.outlier_flags.range).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('sensor.service — getReadings()', () => {
  const sensorService = require('../api/src/services/sensor.service');
  let device;

  beforeEach(async () => {
    await seedBaseConfigs();
    device = await sensorService.createDevice({
      device_id: `dev_read_${Date.now()}`,
      label: 'Read Sensor',
      unit: 'Pa'
    });
    await sensorService.ingestReading({
      device_id: device.device_id,
      timestamp: new Date().toISOString(),
      value: 101325
    });
  });

  test('getReadings returns readings for the given device', async () => {
    const result = await sensorService.getReadings(device.device_id, {}, 1, 100);
    expect(result).toHaveProperty('total');
    expect(result.readings.length).toBeGreaterThanOrEqual(1);
    result.readings.forEach(r => expect(r.device_id).toBe(device.device_id));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('sensor.service — cleanupExpiredReadings()', () => {
  const sensorService = require('../api/src/services/sensor.service');

  beforeEach(async () => {
    await seedBaseConfigs();
  });

  test('deletes readings whose expires_at is in the past', async () => {
    const SensorReading = require('../api/src/models/SensorReading');
    // Insert an already-expired reading directly
    await SensorReading.create({
      device_id: 'cleanup_dev',
      timestamp: new Date(Date.now() - 86400000),
      value: 10,
      unit: 'C',
      is_raw: true,
      is_cleaned: false,
      expires_at: new Date(Date.now() - 1000) // expired 1 second ago
    });
    const deleted = await sensorService.cleanupExpiredReadings();
    expect(deleted).toBeGreaterThanOrEqual(1);
    const remaining = await SensorReading.countDocuments({ device_id: 'cleanup_dev' });
    expect(remaining).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. SEARCH SERVICE
// ════════════════════════════════════════════════════════════════════════════

describe('search.service — unifiedSearch()', () => {
  const searchService = require('../api/src/services/search.service');
  let editorId;

  beforeEach(async () => {
    const u = await makeUser({ username: `srch_editor_${Date.now()}`, role: 'editor' });
    editorId = u._id;

    // Create published movies
    await Movie.create({
      title: 'Galactic Odyssey',
      description: 'A sci-fi epic',
      categories: ['sci-fi'],
      tags: ['space'],
      is_published: true,
      created_by: editorId,
      revisions: []
    });
    await Movie.create({
      title: 'Mystery Train',
      description: 'A noir thriller',
      categories: ['thriller'],
      tags: ['mystery'],
      is_published: true,
      created_by: editorId,
      revisions: []
    });

    // Create a published content item
    await ContentItem.create({
      content_type: 'article',
      title: 'Galactic Exploration Article',
      body: 'An article about space exploration.',
      status: 'published',
      author: editorId,
      revisions: []
    });
  });

  test('returns empty results for an empty query string', async () => {
    const result = await searchService.unifiedSearch('', {}, 1, 20, 'regular_user');
    expect(result.movies).toHaveLength(0);
    expect(result.content).toHaveLength(0);
    expect(result.users).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  test('finds movies by title keyword', async () => {
    const result = await searchService.unifiedSearch('Galactic', {}, 1, 20, 'regular_user');
    // Should include at least the Galactic Odyssey movie
    expect(result.movies.length).toBeGreaterThanOrEqual(1);
    const titles = result.movies.map(m => m.title);
    expect(titles.some(t => t.toLowerCase().includes('galactic'))).toBe(true);
  });

  test('respects role-based content visibility: regular_user only sees published content', async () => {
    // Add a draft content item that should NOT appear for regular_user
    await ContentItem.create({
      content_type: 'article',
      title: 'Secret Draft',
      body: 'Internal only draft content',
      status: 'draft',
      author: editorId,
      revisions: []
    });

    const regularResult = await searchService.unifiedSearch('Secret Draft', {}, 1, 20, 'regular_user');
    const draftInResults = regularResult.content.some(c => c.title === 'Secret Draft');
    expect(draftInResults).toBe(false);

    const editorResult = await searchService.unifiedSearch('Secret Draft', {}, 1, 20, 'editor');
    const draftVisibleToEditor = editorResult.content.some(c => c.title === 'Secret Draft');
    expect(draftVisibleToEditor).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('search.service — getSuggestions()', () => {
  const searchService = require('../api/src/services/search.service');
  let editorId;

  beforeEach(async () => {
    const u = await makeUser({ username: `sug_editor_${Date.now()}`, role: 'editor' });
    editorId = u._id;
  });

  test('returns empty array for a partial shorter than 2 characters', async () => {
    const suggestions = await searchService.getSuggestions('a');
    expect(suggestions).toEqual([]);
  });

  test('returns empty array for empty partial', async () => {
    const suggestions = await searchService.getSuggestions('');
    expect(suggestions).toEqual([]);
  });

  test('returns movie title as suggestion when partial matches a published movie title', async () => {
    await Movie.create({
      title: 'Starlight Serenade',
      description: 'A beautiful film',
      is_published: true,
      created_by: editorId,
      revisions: []
    });
    const suggestions = await searchService.getSuggestions('Star');
    // Should have at least one suggestion referencing the title
    const found = suggestions.some(
      s => (s.text || '').toLowerCase().includes('star')
    );
    expect(found).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('search.service — trackInteraction()', () => {
  const searchService = require('../api/src/services/search.service');
  const UserInteraction = require('../api/src/models/UserInteraction');

  test('creates a UserInteraction record in the database', async () => {
    const u = await makeUser({ username: `track_user_${Date.now()}` });
    const movieId = new mongoose.Types.ObjectId();

    await searchService.trackInteraction(u._id, 'movie', movieId, 'view', 'galactic');

    const record = await UserInteraction.findOne({ user_id: u._id });
    expect(record).not.toBeNull();
    expect(record.entity_type).toBe('movie');
    expect(record.action_type).toBe('view');
    expect(record.search_query).toBe('galactic');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('search.service — refreshSuggestions()', () => {
  const searchService = require('../api/src/services/search.service');
  const SearchSuggestion = require('../api/src/models/SearchSuggestion');
  let editorId;

  beforeEach(async () => {
    const u = await makeUser({ username: `refresh_editor_${Date.now()}`, role: 'editor' });
    editorId = u._id;
  });

  test('clears old suggestions and re-populates from published movies', async () => {
    // Create two published movies
    await Movie.create({
      title: 'Refresh Movie Alpha',
      is_published: true,
      created_by: editorId,
      revisions: []
    });
    await Movie.create({
      title: 'Refresh Movie Beta',
      is_published: true,
      created_by: editorId,
      revisions: []
    });

    const count = await searchService.refreshSuggestions();
    expect(count).toBeGreaterThanOrEqual(2);

    const stored = await SearchSuggestion.find({});
    expect(stored.length).toBeGreaterThanOrEqual(2);
    const texts = stored.map(s => s.text);
    expect(texts.some(t => t.includes('Refresh Movie'))).toBe(true);
  });
});
