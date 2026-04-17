/**
 * CineRide — Service Business Logic Unit Tests
 *
 * Covers:
 *   auth.service.js   — login portal enforcement, changePassword rules,
 *                       revokeAllSessions keeps current token active
 *   config.service.js — getConfig default, setConfig category requirement,
 *                       deleteConfig protected keys, cache behaviour
 *   ride.service.js   — time_window validation, state-machine transitions,
 *                       cancel within/outside free window, rider_count limits
 *   content.service.js — two-step review chain, sensitive word detection,
 *                        type-specific validation, rejection resets to draft
 *
 * Uses mongodb-memory-server for a real (but in-memory) Mongoose store.
 */

'use strict';

// ── env bootstrap (must happen before any service import) ────────────────────
process.env.JWT_SECRET = 'test-service-logic-secret';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const { startTestDb, stopTestDb, clearCollections } = require('../API_tests/helpers/setup');

beforeAll(async () => {
  await startTestDb();
}, 30000);

afterAll(async () => {
  await stopTestDb();
}, 15000);

// Clear every collection between suites so tests don't bleed state.
afterEach(async () => {
  await clearCollections();
});

// ── helpers ──────────────────────────────────────────────────────────────────

const { hashPassword } = require('../api/src/utils/crypto');
const User = require('../api/src/models/User');
const Session = require('../api/src/models/Session');
const ConfigDictionary = require('../api/src/models/ConfigDictionary');
const RideRequest = require('../api/src/models/RideRequest');
const ContentItem = require('../api/src/models/ContentItem');
const ContentReview = require('../api/src/models/ContentReview');

async function makeUser(overrides = {}) {
  return User.create({
    username: `u_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    password_hash: await hashPassword('Pass1234!'),
    role: 'regular_user',
    display_name: 'Test User',
    status: 'active',
    ...overrides
  });
}

async function makeConfig(key, value, category = 'general') {
  return ConfigDictionary.create({ key, value, category });
}

function futureWindow(offsetMs = 600000) {
  const start = new Date(Date.now() + offsetMs);
  const end = new Date(start.getTime() + 3600000); // +1 h
  return { time_window_start: start.toISOString(), time_window_end: end.toISOString() };
}

// ════════════════════════════════════════════════════════════════════════════
// AUTH SERVICE
// ════════════════════════════════════════════════════════════════════════════

describe('auth.service — login()', () => {
  const authService = require('../api/src/services/auth.service');

  test('login succeeds with correct credentials (no portal)', async () => {
    const u = await makeUser({ username: 'login_ok' });
    const result = await authService.login('login_ok', 'Pass1234!');
    expect(result.token).toBeTruthy();
    expect(result.user.username).toBe('login_ok');
  });

  test('login returns must_change_password=true when flag set', async () => {
    await makeUser({ username: 'mcp_user', must_change_password: true });
    const result = await authService.login('mcp_user', 'Pass1234!');
    expect(result.must_change_password).toBe(true);
  });

  test('login returns must_change_password=false for normal users', async () => {
    await makeUser({ username: 'mcp_false_user', must_change_password: false });
    const result = await authService.login('mcp_false_user', 'Pass1234!');
    expect(result.must_change_password).toBe(false);
  });

  test('login with wrong password throws UnauthorizedError', async () => {
    await makeUser({ username: 'wrong_pw' });
    await expect(authService.login('wrong_pw', 'BadPass!!')).rejects.toMatchObject({
      statusCode: 401
    });
  });

  test('login with unknown username throws UnauthorizedError', async () => {
    await expect(authService.login('no_such_user', 'Pass1234!')).rejects.toMatchObject({
      statusCode: 401
    });
  });

  test('admin portal rejects a regular_user account', async () => {
    await makeUser({ username: 'regu_user', role: 'regular_user' });
    await expect(authService.login('regu_user', 'Pass1234!', 'admin')).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining('does not match')
    });
  });

  test('editor portal rejects an administrator account', async () => {
    await makeUser({ username: 'admin_user', role: 'administrator' });
    await expect(authService.login('admin_user', 'Pass1234!', 'editor')).rejects.toMatchObject({
      statusCode: 401
    });
  });

  test('editor portal accepts an editor account', async () => {
    await makeUser({ username: 'editor_user', role: 'editor' });
    const result = await authService.login('editor_user', 'Pass1234!', 'editor');
    expect(result.token).toBeTruthy();
  });

  test('login creates a Session record in the database', async () => {
    await makeUser({ username: 'session_user' });
    const result = await authService.login('session_user', 'Pass1234!');
    const session = await Session.findOne({ token: result.token });
    expect(session).not.toBeNull();
    expect(session.revoked).toBe(false);
  });

  test('inactive user cannot log in', async () => {
    await makeUser({ username: 'inactive_user', status: 'inactive' });
    await expect(authService.login('inactive_user', 'Pass1234!')).rejects.toMatchObject({
      statusCode: 401
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('auth.service — changePassword()', () => {
  const authService = require('../api/src/services/auth.service');

  test('changePassword rejects a new password shorter than 8 characters', async () => {
    const u = await makeUser({ username: 'cp_short' });
    await expect(authService.changePassword(u._id, 'Pass1234!', 'short')).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('at least 8 characters')
    });
  });

  test('changePassword rejects when new password equals current password', async () => {
    const u = await makeUser({ username: 'cp_same' });
    await expect(authService.changePassword(u._id, 'Pass1234!', 'Pass1234!')).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('different from current')
    });
  });

  test('changePassword rejects when current password is wrong', async () => {
    const u = await makeUser({ username: 'cp_wrong' });
    await expect(authService.changePassword(u._id, 'WrongPass!', 'NewPass99!')).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('incorrect')
    });
  });

  test('changePassword succeeds and clears must_change_password flag', async () => {
    const u = await makeUser({ username: 'cp_ok', must_change_password: true });
    await authService.changePassword(u._id, 'Pass1234!', 'NewPass99!');
    const updated = await User.findById(u._id);
    expect(updated.must_change_password).toBe(false);
  });

  test('changePassword rejects unknown userId with NotFoundError', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await expect(authService.changePassword(fakeId, 'Pass1234!', 'NewPass99!')).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('auth.service — revokeAllSessions()', () => {
  const authService = require('../api/src/services/auth.service');

  test('revokeAllSessions revokes other sessions but keeps the current token active', async () => {
    const u = await makeUser({ username: 'revoke_user' });

    // Insert two sessions manually with distinct tokens so there is no
    // duplicate-key collision that would occur if two logins happen at exactly
    // the same millisecond (identical JWT iat).
    const expires = new Date(Date.now() + 3600000);
    const tokenA = `fake_token_A_${Date.now()}`;
    const tokenB = `fake_token_B_${Date.now()}`;
    await Session.create({ user_id: u._id, token: tokenA, expires_at: expires, revoked: false });
    await Session.create({ user_id: u._id, token: tokenB, expires_at: expires, revoked: false });

    // Revoke all except tokenB
    await authService.revokeAllSessions(u._id, tokenB);

    const sessionA = await Session.findOne({ token: tokenA });
    const sessionB = await Session.findOne({ token: tokenB });

    expect(sessionA.revoked).toBe(true);
    expect(sessionB.revoked).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CONFIG SERVICE
// ════════════════════════════════════════════════════════════════════════════

describe('config.service — getConfig()', () => {
  beforeEach(() => {
    // Force cache expiry by re-requiring module (Jest module registry is shared,
    // so instead we manipulate the module's exported refreshCache to reset state)
    const configService = require('../api/src/services/config.service');
    // Reset the cache timestamp by calling refreshCache eagerly
    return configService.refreshCache();
  });

  test('returns stored value for an existing key', async () => {
    await makeConfig('test_key_exists', 42, 'thresholds');
    const configService = require('../api/src/services/config.service');
    await configService.refreshCache();
    const value = await configService.getConfig('test_key_exists');
    expect(value).toBe(42);
  });

  test('returns defaultValue when key is absent', async () => {
    const configService = require('../api/src/services/config.service');
    const value = await configService.getConfig('nonexistent_key_xyz', 'fallback');
    expect(value).toBe('fallback');
  });

  test('returns null default when defaultValue is omitted and key missing', async () => {
    const configService = require('../api/src/services/config.service');
    const value = await configService.getConfig('nonexistent_key_abc');
    expect(value).toBeNull();
  });

  test('returns updated value after setConfig invalidates cache inline', async () => {
    await makeConfig('updatable_key', 'old', 'general');
    const configService = require('../api/src/services/config.service');
    await configService.refreshCache();
    expect(await configService.getConfig('updatable_key')).toBe('old');

    // Update in-place (setConfig writes directly to cache)
    await configService.setConfig('updatable_key', 'new');
    expect(await configService.getConfig('updatable_key')).toBe('new');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('config.service — setConfig()', () => {
  test('creates a new config entry when it does not exist', async () => {
    const configService = require('../api/src/services/config.service');
    const entry = await configService.setConfig('brand_new_key', 'hello', 'general', 'test desc');
    expect(entry.key).toBe('brand_new_key');
    expect(entry.value).toBe('hello');
    expect(entry.category).toBe('general');
  });

  test('throws ValidationError when creating a new key without category', async () => {
    const configService = require('../api/src/services/config.service');
    await expect(configService.setConfig('no_cat_key', 'val')).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('Category is required')
    });
  });

  test('updates an existing entry without requiring category', async () => {
    await makeConfig('existing_cfg', 'v1', 'general');
    const configService = require('../api/src/services/config.service');
    const updated = await configService.setConfig('existing_cfg', 'v2');
    expect(updated.value).toBe('v2');
  });

  test('stores complex (object) values correctly', async () => {
    const configService = require('../api/src/services/config.service');
    const tags = ['action', 'comedy', 'drama'];
    await configService.setConfig('featured_tags', tags, 'tags');
    await configService.refreshCache();
    const val = await configService.getConfig('featured_tags');
    expect(val).toEqual(tags);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('config.service — deleteConfig()', () => {
  const PROTECTED = [
    'auto_cancel_minutes',
    'free_cancel_window_minutes',
    'min_ride_advance_minutes',
    'dispute_escalation_hours',
    'max_ride_payment_amount',
    'time_drift_threshold_seconds',
    'sensor_retention_days',
    'ledger_max_retries',
    'featured_tags'
  ];

  test.each(PROTECTED)('cannot delete protected key "%s"', async (key) => {
    const configService = require('../api/src/services/config.service');
    await expect(configService.deleteConfig(key)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining(key)
    });
  });

  test('deletes a non-protected key successfully', async () => {
    await makeConfig('deletable_key', 'gone', 'general');
    const configService = require('../api/src/services/config.service');
    await configService.refreshCache();
    await configService.deleteConfig('deletable_key');
    // After delete the cache entry should also be cleared
    const val = await configService.getConfig('deletable_key', 'MISSING');
    expect(val).toBe('MISSING');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// RIDE SERVICE
// ════════════════════════════════════════════════════════════════════════════

describe('ride.service — createRideRequest() validation', () => {
  let userId;

  beforeEach(async () => {
    const u = await makeUser({ username: `ride_user_${Date.now()}` });
    userId = u._id;

    // Seed required config values so the service can read them
    await ConfigDictionary.create({ key: 'min_ride_advance_minutes', value: 5, category: 'thresholds' });
    await ConfigDictionary.create({ key: 'auto_cancel_minutes', value: 30, category: 'thresholds' });
    await ConfigDictionary.create({ key: 'free_cancel_window_minutes', value: 5, category: 'thresholds' });
  });

  test('creates a ride with valid data and sets status to pending_match', async () => {
    const rideService = require('../api/src/services/ride.service');
    const tw = futureWindow();
    const ride = await rideService.createRideRequest({
      pickup_text: 'Start',
      dropoff_text: 'End',
      rider_count: 2,
      vehicle_type: 'sedan',
      ...tw
    }, userId);
    expect(ride.status).toBe('pending_match');
    expect(ride.rider_count).toBe(2);
    expect(ride.auto_cancel_at).not.toBeNull();
  });

  test('rejects when time window exceeds 4 hours', async () => {
    const rideService = require('../api/src/services/ride.service');
    const start = new Date(Date.now() + 600000); // 10 min from now
    const end = new Date(start.getTime() + 5 * 3600000); // 5 hours later
    await expect(rideService.createRideRequest({
      pickup_text: 'A', dropoff_text: 'B', rider_count: 1,
      time_window_start: start.toISOString(),
      time_window_end: end.toISOString()
    }, userId)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('4 hours')
    });
  });

  test('rejects when end time is not after start time', async () => {
    const rideService = require('../api/src/services/ride.service');
    const start = new Date(Date.now() + 600000);
    const end = new Date(start.getTime() - 1000); // before start
    await expect(rideService.createRideRequest({
      pickup_text: 'A', dropoff_text: 'B', rider_count: 1,
      time_window_start: start.toISOString(),
      time_window_end: end.toISOString()
    }, userId)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('after start time')
    });
  });

  test('rejects when start time is too soon (< min_ride_advance_minutes)', async () => {
    const rideService = require('../api/src/services/ride.service');
    const start = new Date(Date.now() + 60000); // only 1 min from now
    const end = new Date(start.getTime() + 3600000);
    await expect(rideService.createRideRequest({
      pickup_text: 'A', dropoff_text: 'B', rider_count: 1,
      time_window_start: start.toISOString(),
      time_window_end: end.toISOString()
    }, userId)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('minutes from now')
    });
  });

  test('sets is_carpool=true when requested', async () => {
    const rideService = require('../api/src/services/ride.service');
    const tw = futureWindow();
    const ride = await rideService.createRideRequest({
      pickup_text: 'A', dropoff_text: 'B', rider_count: 1,
      is_carpool: true, ...tw
    }, userId);
    expect(ride.is_carpool).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ride.service — state-machine transitions', () => {
  let userId, ride;

  beforeEach(async () => {
    const u = await makeUser({ username: `sm_user_${Date.now()}` });
    userId = u._id;

    await ConfigDictionary.create({ key: 'min_ride_advance_minutes', value: 5, category: 'thresholds' });
    await ConfigDictionary.create({ key: 'auto_cancel_minutes', value: 30, category: 'thresholds' });
    await ConfigDictionary.create({ key: 'free_cancel_window_minutes', value: 5, category: 'thresholds' });

    const rideService = require('../api/src/services/ride.service');
    const tw = futureWindow();
    ride = await rideService.createRideRequest({
      pickup_text: 'P', dropoff_text: 'D', rider_count: 1, ...tw
    }, userId);
  });

  test('pending_match → accepted is valid', async () => {
    const rideService = require('../api/src/services/ride.service');
    const updated = await rideService.transitionRide(ride._id, 'accepted', userId);
    expect(updated.status).toBe('accepted');
  });

  test('pending_match → canceled is valid', async () => {
    const rideService = require('../api/src/services/ride.service');
    const updated = await rideService.transitionRide(ride._id, 'canceled', userId);
    expect(updated.status).toBe('canceled');
  });

  test('pending_match → completed is invalid (must throw ValidationError)', async () => {
    const rideService = require('../api/src/services/ride.service');
    await expect(rideService.transitionRide(ride._id, 'completed', userId)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining("Cannot transition from 'pending_match'")
    });
  });

  test('canceled → accepted is invalid (terminal state)', async () => {
    const rideService = require('../api/src/services/ride.service');
    await rideService.transitionRide(ride._id, 'canceled', userId);
    await expect(rideService.transitionRide(ride._id, 'accepted', userId)).rejects.toMatchObject({
      statusCode: 422
    });
  });

  test('accepted → in_progress → completed is valid chain', async () => {
    const rideService = require('../api/src/services/ride.service');
    await rideService.transitionRide(ride._id, 'accepted', userId);
    await rideService.transitionRide(ride._id, 'in_progress', userId);
    const done = await rideService.transitionRide(ride._id, 'completed', userId);
    expect(done.status).toBe('completed');
  });

  test('state_transitions log grows correctly on each transition', async () => {
    const rideService = require('../api/src/services/ride.service');
    const before = ride.state_transitions.length;
    await rideService.transitionRide(ride._id, 'accepted', userId);
    const updated = await RideRequest.findById(ride._id);
    expect(updated.state_transitions.length).toBe(before + 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ride.service — cancelRide()', () => {
  let userId, dispatcherId, ride;

  beforeEach(async () => {
    const u = await makeUser({ username: `cancel_u_${Date.now()}` });
    const d = await makeUser({ username: `cancel_d_${Date.now()}`, role: 'dispatcher' });
    userId = u._id;
    dispatcherId = d._id;

    await ConfigDictionary.create({ key: 'min_ride_advance_minutes', value: 5, category: 'thresholds' });
    await ConfigDictionary.create({ key: 'auto_cancel_minutes', value: 30, category: 'thresholds' });
    await ConfigDictionary.create({ key: 'free_cancel_window_minutes', value: 5, category: 'thresholds' });

    const rideService = require('../api/src/services/ride.service');
    const tw = futureWindow();
    ride = await rideService.createRideRequest({
      pickup_text: 'P', dropoff_text: 'D', rider_count: 1, ...tw
    }, userId);
  });

  test('user can cancel for free within the 5-minute window', async () => {
    const rideService = require('../api/src/services/ride.service');
    // Ride was just created so we are well within the free window
    const result = await rideService.cancelRide(ride._id, userId, 'regular_user');
    // Direct cancel (no approval required) — result is the ride itself
    const cancelled = result.ride || result;
    expect(cancelled.status).toBe('canceled');
  });

  test('user outside free window gets requiresApproval=true', async () => {
    const rideService = require('../api/src/services/ride.service');

    // Create a ride whose created_at is well past the free-cancel window (10 min ago).
    // Mongoose timestamps are set at insert time; we bypass them via the raw
    // MongoDB driver (collection.updateOne) to back-date the document.
    await mongoose.connection.collection('riderequests').updateOne(
      { _id: ride._id },
      { $set: { created_at: new Date(Date.now() - 10 * 60000) } }
    );

    const result = await rideService.cancelRide(ride._id, userId, 'regular_user');
    expect(result.requiresApproval).toBe(true);
  });

  test('dispatcher can cancel outside the free window without approval', async () => {
    const rideService = require('../api/src/services/ride.service');
    // Expire the free window via raw driver
    await mongoose.connection.collection('riderequests').updateOne(
      { _id: ride._id },
      { $set: { created_at: new Date(Date.now() - 10 * 60000) } }
    );

    const result = await rideService.cancelRide(ride._id, dispatcherId, 'dispatcher');
    const cancelled = result.ride || result;
    expect(cancelled.status).toBe('canceled');
  });

  test('cannot cancel a completed ride', async () => {
    const rideService = require('../api/src/services/ride.service');
    await rideService.transitionRide(ride._id, 'accepted', userId);
    await rideService.transitionRide(ride._id, 'in_progress', userId);
    await rideService.transitionRide(ride._id, 'completed', userId);

    await expect(rideService.cancelRide(ride._id, userId, 'regular_user')).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining("Cannot cancel ride in 'completed' status")
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CONTENT SERVICE
// ════════════════════════════════════════════════════════════════════════════

describe('content.service — createContent()', () => {
  let authorId;

  beforeEach(async () => {
    const u = await makeUser({ username: `cont_author_${Date.now()}`, role: 'editor' });
    authorId = u._id;
  });

  test('creates an article content item in draft status', async () => {
    const contentService = require('../api/src/services/content.service');
    const item = await contentService.createContent({
      content_type: 'article',
      title: 'Test Article',
      body: 'Some body text'
    }, authorId);
    expect(item.status).toBe('draft');
    expect(item.content_type).toBe('article');
    expect(item.revisions).toHaveLength(1);
    expect(item.revisions[0].change_type).toBe('create');
  });

  test('event content requires event_date (throws ValidationError)', async () => {
    const contentService = require('../api/src/services/content.service');
    await expect(contentService.createContent({
      content_type: 'event',
      title: 'Missing Date Event',
      body: ''
    }, authorId)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('event_date')
    });
  });

  test('video content without video_url or body throws ValidationError', async () => {
    const contentService = require('../api/src/services/content.service');
    await expect(contentService.createContent({
      content_type: 'video',
      title: 'Empty Video',
      body: ''
    }, authorId)).rejects.toMatchObject({
      statusCode: 422
    });
  });

  test('gallery content with non-array gallery_items throws ValidationError', async () => {
    const contentService = require('../api/src/services/content.service');
    await expect(contentService.createContent({
      content_type: 'gallery',
      title: 'Bad Gallery',
      gallery_items: 'not-an-array'
    }, authorId)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('array')
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('content.service — submitForReview() & reviewContent()', () => {
  let authorId, reviewer1Id, reviewer2Id;

  beforeEach(async () => {
    const a = await makeUser({ username: `rev_author_${Date.now()}`, role: 'editor' });
    const r1 = await makeUser({ username: `rev1_${Date.now()}`, role: 'reviewer' });
    const r2 = await makeUser({ username: `rev2_${Date.now()}`, role: 'reviewer' });
    authorId = a._id;
    reviewer1Id = r1._id;
    reviewer2Id = r2._id;
  });

  async function makeDraft() {
    const contentService = require('../api/src/services/content.service');
    return contentService.createContent({
      content_type: 'article',
      title: `Draft ${Date.now()}`,
      body: 'Body text'
    }, authorId);
  }

  test('submitForReview transitions draft → in_review_1', async () => {
    const contentService = require('../api/src/services/content.service');
    const item = await makeDraft();
    const { item: reviewed } = await contentService.submitForReview(item._id, authorId, false);
    expect(reviewed.status).toBe('in_review_1');
  });

  test('cannot submit a non-draft item for review', async () => {
    const contentService = require('../api/src/services/content.service');
    const item = await makeDraft();
    await contentService.submitForReview(item._id, authorId, false);

    // Already in_review_1 — re-submitting should fail
    await expect(contentService.submitForReview(item._id, authorId, false)).rejects.toMatchObject({
      statusCode: 422
    });
  });

  test('step-1 approval moves content to in_review_2', async () => {
    const contentService = require('../api/src/services/content.service');
    const item = await makeDraft();
    await contentService.submitForReview(item._id, authorId, false);
    const result = await contentService.reviewContent(item._id, reviewer1Id, 1, 'approved');
    expect(result.status).toBe('in_review_2');
  });

  test('step-2 approval by different reviewer publishes the content', async () => {
    const contentService = require('../api/src/services/content.service');
    const item = await makeDraft();
    await contentService.submitForReview(item._id, authorId, false);
    await contentService.reviewContent(item._id, reviewer1Id, 1, 'approved');
    const result = await contentService.reviewContent(item._id, reviewer2Id, 2, 'approved');
    expect(result.status).toBe('published');
  });

  test('same reviewer cannot approve both step 1 and step 2', async () => {
    const contentService = require('../api/src/services/content.service');
    const item = await makeDraft();
    await contentService.submitForReview(item._id, authorId, false);
    await contentService.reviewContent(item._id, reviewer1Id, 1, 'approved');

    // Same reviewer tries step 2
    await expect(
      contentService.reviewContent(item._id, reviewer1Id, 2, 'approved')
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('different from step 1')
    });
  });

  test('rejection at step 1 resets status to draft', async () => {
    const contentService = require('../api/src/services/content.service');
    const item = await makeDraft();
    await contentService.submitForReview(item._id, authorId, false);
    const result = await contentService.reviewContent(item._id, reviewer1Id, 1, 'rejected', 'Not good enough');
    expect(result.status).toBe('draft');
  });

  test('rejection at step 2 also resets status to draft', async () => {
    const contentService = require('../api/src/services/content.service');
    const item = await makeDraft();
    await contentService.submitForReview(item._id, authorId, false);
    await contentService.reviewContent(item._id, reviewer1Id, 1, 'approved');
    const result = await contentService.reviewContent(item._id, reviewer2Id, 2, 'rejected', 'Needs revision');
    expect(result.status).toBe('draft');
  });

  test('rejection without a reason throws ValidationError', async () => {
    const contentService = require('../api/src/services/content.service');
    const item = await makeDraft();
    await contentService.submitForReview(item._id, authorId, false);
    await expect(
      contentService.reviewContent(item._id, reviewer1Id, 1, 'rejected')
    ).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('reason')
    });
  });

  test('content with scheduled_publish_date in future is set to scheduled, not published', async () => {
    const contentService = require('../api/src/services/content.service');
    const futureDate = new Date(Date.now() + 7 * 24 * 3600000).toISOString();
    const item = await contentService.createContent({
      content_type: 'article',
      title: 'Scheduled Article',
      body: 'Text',
      scheduled_publish_date: futureDate
    }, authorId);
    await contentService.submitForReview(item._id, authorId, false);
    await contentService.reviewContent(item._id, reviewer1Id, 1, 'approved');
    const result = await contentService.reviewContent(item._id, reviewer2Id, 2, 'approved');
    expect(result.status).toBe('scheduled');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('content.service — sensitive word detection', () => {
  // The sensitive-words util uses module-level closure variables (cachedWords,
  // cacheTimestamp).  scanForSensitiveWords calls getSensitiveWords() as a
  // local closure — patching exports has no effect.  We therefore combine two
  // techniques: (1) spy on ConfigDictionary.findOne to inject our word list,
  // and (2) spy on Date.now to return a value 2 minutes in the future so the
  // 60-second TTL check always sees a stale cache and calls findOne.

  let authorId;
  let dateNowSpy;

  beforeEach(async () => {
    const u = await makeUser({ username: `sw_user_${Date.now()}`, role: 'editor' });
    authorId = u._id;

    // Force cache expiry: make Date.now() return a time far in the future
    // relative to any previously recorded cacheTimestamp.  We restore this
    // spy AFTER contentService.submitForReview is done so DB ops still run.
    const realNow = Date.now();
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow + 120 * 1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function spyFindOneForWords(words) {
    const originalFindOne = ConfigDictionary.findOne.bind(ConfigDictionary);
    jest.spyOn(ConfigDictionary, 'findOne').mockImplementation(function(query, ...args) {
      if (query && query.key === 'sensitive_words') {
        return Promise.resolve(words.length > 0 ? { value: words } : null);
      }
      return originalFindOne(query, ...args);
    });
  }

  test('submitForReview warns (but does not block) when content contains sensitive words', async () => {
    spyFindOneForWords(['badword', 'explicit']);

    const contentService = require('../api/src/services/content.service');
    const item = await contentService.createContent({
      content_type: 'article',
      title: 'Contains badword here',
      body: 'Normal body text'
    }, authorId);

    const result = await contentService.submitForReview(item._id, authorId, false);

    expect(result.warning).toBe(true);
    expect(result.flagged_words).toContain('badword');
    // Item stays in draft because acknowledgedSensitiveWords is false
    const fresh = await ContentItem.findById(item._id);
    expect(fresh.status).toBe('draft');
  });

  test('submitForReview proceeds when acknowledgedSensitiveWords=true', async () => {
    spyFindOneForWords(['explicit']);

    const contentService = require('../api/src/services/content.service');
    const item = await contentService.createContent({
      content_type: 'article',
      title: 'Contains explicit content',
      body: 'Normal body'
    }, authorId);

    const result = await contentService.submitForReview(item._id, authorId, true);

    expect(result.warning).toBe(false);
    expect(result.item?.status).toBe('in_review_1');
  });

  test('content with no sensitive words submits without warning', async () => {
    spyFindOneForWords([]); // empty list → no flagged words

    const contentService = require('../api/src/services/content.service');
    const item = await contentService.createContent({
      content_type: 'article',
      title: 'Totally clean title',
      body: 'All good here'
    }, authorId);

    const result = await contentService.submitForReview(item._id, authorId, false);

    expect(result.warning).toBe(false);
    expect(result.item?.status).toBe('in_review_1');
  });
});
