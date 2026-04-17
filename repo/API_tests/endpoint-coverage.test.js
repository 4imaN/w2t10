/**
 * endpoint-coverage.test.js
 *
 * Covers 9 previously-untested API endpoints:
 *   1.  POST   /api/auth/revoke-sessions
 *   2.  DELETE /api/users/:id
 *   3.  POST   /api/movies/:id/poster
 *   4.  POST   /api/movies/:id/stills
 *   5.  DELETE /api/movies/:id
 *   6.  POST   /api/content/:id/unpublish
 *   7.  DELETE /api/content/:id
 *   8.  POST   /api/dispatch/rides/:id/approve-cancel
 *   9.  GET    /api/config/:key
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { startTestDb, stopTestDb, clearCollections } = require('./helpers/setup');

// Minimal 1×1 JPEG as a Buffer (base64-encoded)
const JPEG_BUFFER = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP/bAEMABgQFBgUEBgYFBgcHBggKEAoKCQkKFA4PDBAXFBgYFxQWFhodJR8aGyMcFhYgLCAjJicpKikZHy0wLSgwJSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=',
  'base64'
);

let app;

// Tokens keyed by role name
let tokens = {};

// IDs created during setup or tests, shared across describe blocks
let targetUserId;   // a regular_user to be deleted
let movieId;        // movie created for poster/stills/delete tests
let contentId;      // content item for unpublish/delete tests

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret-endpoint-coverage';
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';

  // Ensure upload directories exist for poster/stills tests
  for (const sub of ['posters', 'stills']) {
    fs.mkdirSync(path.join('uploads', sub), { recursive: true });
  }

  await startTestDb();

  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const Movie = require('../api/src/models/Movie');
  const ContentItem = require('../api/src/models/ContentItem');
  const ConfigDictionary = require('../api/src/models/ConfigDictionary');
  const { hashPassword } = require('../api/src/utils/crypto');

  // Seed config keys required by ride service
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
  // Seed config key required for content sensitive-word scanning
  await ConfigDictionary.findOneAndUpdate(
    { key: 'sensitive_words' },
    { key: 'sensitive_words', value: [], category: 'sensitive_words' },
    { upsert: true }
  );

  // Create one user per role
  const roleDefinitions = [
    { username: 'ep_admin',      role: 'administrator' },
    { username: 'ep_editor',     role: 'editor' },
    { username: 'ep_reviewer1',  role: 'reviewer' },
    { username: 'ep_reviewer2',  role: 'reviewer' },
    { username: 'ep_dispatcher', role: 'dispatcher' },
    { username: 'ep_user',       role: 'regular_user' },
  ];

  for (const def of roleDefinitions) {
    await User.create({
      username: def.username,
      password_hash: await hashPassword('Test1234!'),
      role: def.role,
      display_name: def.username
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: def.username, password: 'Test1234!' });
    // For roles with two users (reviewer) store by username instead
    tokens[def.username] = res.body.token;
  }
  // Convenience aliases
  tokens.administrator = tokens.ep_admin;
  tokens.editor        = tokens.ep_editor;
  tokens.dispatcher    = tokens.ep_dispatcher;
  tokens.regular_user  = tokens.ep_user;

  // Create the to-be-deleted regular user up front
  const targetUser = await User.create({
    username: 'ep_target_user',
    password_hash: await hashPassword('Target123!'),
    role: 'regular_user',
    display_name: 'Target User'
  });
  targetUserId = targetUser._id.toString();

  // Create a movie for poster/stills/delete tests
  const movie = await Movie.create({
    title: 'Endpoint Coverage Movie',
    description: 'Created for endpoint coverage tests',
    categories: ['Drama'],
    tags: ['test'],
    mpaa_rating: 'PG',
    is_published: true,
    created_by: targetUser._id,
    revisions: []
  });
  movieId = movie._id.toString();

  // Create a content item, then drive it through the review pipeline to published
  const editorUser = await User.findOne({ username: 'ep_editor' });
  const item = await ContentItem.create({
    content_type: 'article',
    title: 'Endpoint Coverage Article',
    body: 'Body text for coverage article.',
    author: editorUser._id,
    status: 'draft',
    revisions: [{
      snapshot: { title: 'Endpoint Coverage Article', body: 'Body text for coverage article.', content_type: 'article' },
      timestamp: new Date(),
      changed_by: editorUser._id,
      change_type: 'create'
    }]
  });
  contentId = item._id.toString();

  // Drive content to published via the API (submit → review1 → review2)
  await request(app)
    .post(`/api/content/${contentId}/submit`)
    .set('Authorization', `Bearer ${tokens.editor}`)
    .send({ acknowledgedSensitiveWords: false });

  await request(app)
    .post(`/api/content-review/${contentId}/review`)
    .set('Authorization', `Bearer ${tokens.ep_reviewer1}`)
    .send({ decision: 'approved' });

  await request(app)
    .post(`/api/content-review/${contentId}/review`)
    .set('Authorization', `Bearer ${tokens.ep_reviewer2}`)
    .send({ decision: 'approved' });

});

afterAll(async () => {
  await stopTestDb();
});

// ---------------------------------------------------------------------------
// 1. POST /api/auth/revoke-sessions
// ---------------------------------------------------------------------------
describe('POST /api/auth/revoke-sessions', () => {
  let token1, token2;

  beforeAll(async () => {
    // Log in twice to get two distinct session tokens for the same user
    const User = require('../api/src/models/User');
    const { hashPassword } = require('../api/src/utils/crypto');

    // Create a fresh user so we can revoke without touching shared tokens
    await User.create({
      username: 'ep_revoke_user',
      password_hash: await hashPassword('Revoke123!'),
      role: 'regular_user',
      display_name: 'Revoke User'
    });

    const res1 = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ep_revoke_user', password: 'Revoke123!' });
    token1 = res1.body.token;

    const res2 = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ep_revoke_user', password: 'Revoke123!' });
    token2 = res2.body.token;
  });

  test('revoke-sessions with first token succeeds and returns expected message', async () => {
    const res = await request(app)
      .post('/api/auth/revoke-sessions')
      .set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'All other sessions revoked');
  });

  test('second token is invalid after revocation', async () => {
    // token2 should now be revoked
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(401);
  });

  test('first token (the caller) is still valid after revocation', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
  });

  test('unauthenticated request returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/revoke-sessions');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 2. DELETE /api/users/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/users/:id', () => {
  test('admin can delete an existing user and receives confirmation message', async () => {
    const res = await request(app)
      .delete(`/api/users/${targetUserId}`)
      .set('Authorization', `Bearer ${tokens.administrator}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'User deleted');
  });

  test('deleted user is no longer retrievable (GET returns 404)', async () => {
    const res = await request(app)
      .get(`/api/users/${targetUserId}`)
      .set('Authorization', `Bearer ${tokens.administrator}`);
    expect(res.status).toBe(404);
  });

  test('non-admin (editor) gets 403 when attempting to delete a user', async () => {
    const res = await request(app)
      .delete(`/api/users/${targetUserId}`)
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(403);
  });

  test('deleting a non-existent user returns 404', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .delete(`/api/users/${fakeId}`)
      .set('Authorization', `Bearer ${tokens.administrator}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 3. POST /api/movies/:id/poster
// ---------------------------------------------------------------------------
describe('POST /api/movies/:id/poster', () => {
  test('staff (editor) can upload a valid JPG poster and receives movie with poster info', async () => {
    const res = await request(app)
      .post(`/api/movies/${movieId}/poster`)
      .set('Authorization', `Bearer ${tokens.editor}`)
      .attach('poster', JPEG_BUFFER, { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('movie');
    expect(res.body.movie.poster).toBeTruthy();
    expect(res.body.movie.poster.mimetype).toBe('image/jpeg');
    expect(res.body.movie.poster.original_name).toBe('test.jpg');
  });

  test('non-staff (regular_user) gets 403 when uploading a poster', async () => {
    const res = await request(app)
      .post(`/api/movies/${movieId}/poster`)
      .set('Authorization', `Bearer ${tokens.regular_user}`)
      .attach('poster', JPEG_BUFFER, { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(403);
  });

  test('uploading poster for non-existent movie returns 404', async () => {
    const fakeId = '000000000000000000000002';
    const res = await request(app)
      .post(`/api/movies/${fakeId}/poster`)
      .set('Authorization', `Bearer ${tokens.editor}`)
      .attach('poster', JPEG_BUFFER, { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 4. POST /api/movies/:id/stills
// ---------------------------------------------------------------------------
describe('POST /api/movies/:id/stills', () => {
  test('staff can upload stills and response contains a populated stills array', async () => {
    const res = await request(app)
      .post(`/api/movies/${movieId}/stills`)
      .set('Authorization', `Bearer ${tokens.editor}`)
      .attach('stills', JPEG_BUFFER, { filename: 'still1.jpg', contentType: 'image/jpeg' })
      .attach('stills', JPEG_BUFFER, { filename: 'still2.jpg', contentType: 'image/jpeg' });
    // The service deduplicates by fingerprint, so identical buffers will result in 1 entry
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('movie');
    expect(Array.isArray(res.body.movie.stills)).toBe(true);
    expect(res.body.movie.stills.length).toBeGreaterThanOrEqual(1);
    expect(res.body.movie.stills[0]).toHaveProperty('mimetype', 'image/jpeg');
  });

  test('non-staff (regular_user) gets 403 when uploading stills', async () => {
    const res = await request(app)
      .post(`/api/movies/${movieId}/stills`)
      .set('Authorization', `Bearer ${tokens.regular_user}`)
      .attach('stills', JPEG_BUFFER, { filename: 'still.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(403);
  });

  test('uploading stills for non-existent movie returns 404', async () => {
    const fakeId = '000000000000000000000003';
    const res = await request(app)
      .post(`/api/movies/${fakeId}/stills`)
      .set('Authorization', `Bearer ${tokens.editor}`)
      .attach('stills', JPEG_BUFFER, { filename: 'still.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 5. DELETE /api/movies/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/movies/:id', () => {
  let deleteMovieId;

  beforeAll(async () => {
    // Create a fresh movie to delete so we do not disturb the poster/stills movie
    const res = await request(app)
      .post('/api/movies')
      .set('Authorization', `Bearer ${tokens.editor}`)
      .send({
        title: 'Movie To Delete',
        description: 'Will be deleted',
        categories: ['Action'],
        tags: [],
        mpaa_rating: 'G',
        release_date: '2024-01-01'
      });
    deleteMovieId = res.body.movie._id;
  });

  test('non-staff (regular_user) gets 403 when deleting a movie', async () => {
    const res = await request(app)
      .delete(`/api/movies/${deleteMovieId}`)
      .set('Authorization', `Bearer ${tokens.regular_user}`);
    expect(res.status).toBe(403);
  });

  test('staff can delete a movie and receives confirmation message', async () => {
    const res = await request(app)
      .delete(`/api/movies/${deleteMovieId}`)
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Movie deleted');
  });

  test('deleted movie is no longer retrievable (GET returns 404)', async () => {
    const res = await request(app)
      .get(`/api/movies/${deleteMovieId}`)
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(404);
  });

  test('deleting a non-existent movie returns 404', async () => {
    const fakeId = '000000000000000000000004';
    const res = await request(app)
      .delete(`/api/movies/${fakeId}`)
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 6. POST /api/content/:id/unpublish
// ---------------------------------------------------------------------------
describe('POST /api/content/:id/unpublish', () => {
  test('staff can unpublish a published content item', async () => {
    // Verify the item is currently published before unpublishing
    const getRes = await request(app)
      .get(`/api/content/${contentId}`)
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.item.status).toBe('published');

    const res = await request(app)
      .post(`/api/content/${contentId}/unpublish`)
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('item');
    expect(res.body.item.status).toBe('unpublished');
  });

  test('non-staff (regular_user) gets 403 when attempting to unpublish', async () => {
    const res = await request(app)
      .post(`/api/content/${contentId}/unpublish`)
      .set('Authorization', `Bearer ${tokens.regular_user}`);
    expect(res.status).toBe(403);
  });

  test('cannot unpublish content that is already in draft status', async () => {
    // Create a fresh draft item
    const createRes = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${tokens.editor}`)
      .send({ title: 'Draft Article', body: 'Draft body', content_type: 'article' });
    const draftId = createRes.body.item._id;

    const res = await request(app)
      .post(`/api/content/${draftId}/unpublish`)
      .set('Authorization', `Bearer ${tokens.editor}`);
    // draft is not published/scheduled, so service throws a ValidationError (422)
    expect(res.status).toBe(422);
  });

  test('unpublishing a non-existent content item returns 404', async () => {
    const fakeId = '000000000000000000000005';
    const res = await request(app)
      .post(`/api/content/${fakeId}/unpublish`)
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 7. DELETE /api/content/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/content/:id', () => {
  let deleteContentId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${tokens.editor}`)
      .send({ title: 'Content To Delete', body: 'Will be deleted', content_type: 'article' });
    deleteContentId = res.body.item._id;
  });

  test('non-staff (regular_user) gets 403 when deleting content', async () => {
    const res = await request(app)
      .delete(`/api/content/${deleteContentId}`)
      .set('Authorization', `Bearer ${tokens.regular_user}`);
    expect(res.status).toBe(403);
  });

  test('staff can delete a content item and receives confirmation message', async () => {
    const res = await request(app)
      .delete(`/api/content/${deleteContentId}`)
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Content deleted');
  });

  test('deleted content item is no longer retrievable (GET returns 404)', async () => {
    const res = await request(app)
      .get(`/api/content/${deleteContentId}`)
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(404);
  });

  test('deleting a non-existent content item returns 404', async () => {
    const fakeId = '000000000000000000000006';
    const res = await request(app)
      .delete(`/api/content/${fakeId}`)
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 8. POST /api/dispatch/rides/:id/approve-cancel
// ---------------------------------------------------------------------------
describe('POST /api/dispatch/rides/:id/approve-cancel', () => {
  // This describe block owns a dedicated ride that is purposefully placed into
  // the cancellation-pending state via direct model manipulation, which gives us
  // a deterministic starting condition regardless of timing.
  let approveCancelRideId;

  beforeAll(async () => {
    const RideRequest = require('../api/src/models/RideRequest');
    const User = require('../api/src/models/User');

    const rideUser = await User.findOne({ username: 'ep_user' });
    const start = new Date(Date.now() + 10 * 60 * 1000);
    const end   = new Date(start.getTime() + 60 * 60 * 1000);

    // Create the ride directly in the model in pending_match status
    const ride = await RideRequest.create({
      requester: rideUser._id,
      pickup_text: 'Cinema Entrance',
      dropoff_text: 'Hotel Lobby',
      rider_count: 2,
      time_window_start: start,
      time_window_end: end,
      vehicle_type: 'sedan',
      status: 'pending_match',
      cancellation_requested: true,   // simulate: user requested cancel outside free window
      auto_cancel_at: new Date(Date.now() + 30 * 60 * 1000),
      state_transitions: [{
        from: 'created',
        to: 'pending_match',
        timestamp: new Date(),
        actor: rideUser._id,
        reason: 'Ride request submitted'
      }]
    });

    approveCancelRideId = ride._id.toString();
  });

  test('non-dispatcher (editor) gets 403 when approving cancellation', async () => {
    const res = await request(app)
      .post(`/api/dispatch/rides/${approveCancelRideId}/approve-cancel`)
      .set('Authorization', `Bearer ${tokens.editor}`);
    expect(res.status).toBe(403);
  });

  test('dispatcher can approve cancellation for a ride that requested it', async () => {
    const res = await request(app)
      .post(`/api/dispatch/rides/${approveCancelRideId}/approve-cancel`)
      .set('Authorization', `Bearer ${tokens.dispatcher}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ride');
    expect(res.body.ride.status).toBe('canceled');
  });

  test('approving cancellation for a ride without a pending request returns 422', async () => {
    // The ride is now canceled with cancellation_requested = false; re-approving should fail
    const res = await request(app)
      .post(`/api/dispatch/rides/${approveCancelRideId}/approve-cancel`)
      .set('Authorization', `Bearer ${tokens.dispatcher}`);
    expect(res.status).toBe(422);
  });

  test('approving cancellation for a non-existent ride returns 404', async () => {
    const fakeId = '000000000000000000000007';
    const res = await request(app)
      .post(`/api/dispatch/rides/${fakeId}/approve-cancel`)
      .set('Authorization', `Bearer ${tokens.dispatcher}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 9. GET /api/config/:key
// ---------------------------------------------------------------------------
describe('GET /api/config/:key', () => {
  const TEST_CONFIG_KEY = 'ep_test_feature_flag';

  beforeAll(async () => {
    // Seed a known config key via the API so we can retrieve it by key
    await request(app)
      .post('/api/config')
      .set('Authorization', `Bearer ${tokens.administrator}`)
      .send({
        key: TEST_CONFIG_KEY,
        value: true,
        category: 'general',
        description: 'Feature flag for endpoint coverage tests'
      });
  });

  test('admin can retrieve an existing config key with correct shape', async () => {
    const res = await request(app)
      .get(`/api/config/${TEST_CONFIG_KEY}`)
      .set('Authorization', `Bearer ${tokens.administrator}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('key', TEST_CONFIG_KEY);
    expect(res.body).toHaveProperty('value', true);
  });

  test('retrieving a missing config key returns 404 with NOT_FOUND code', async () => {
    const res = await request(app)
      .get('/api/config/nonexistent_key_xyz_999')
      .set('Authorization', `Bearer ${tokens.administrator}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
  });

  test('non-admin (dispatcher) gets 403 when accessing config by key', async () => {
    const res = await request(app)
      .get(`/api/config/${TEST_CONFIG_KEY}`)
      .set('Authorization', `Bearer ${tokens.dispatcher}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request to config key endpoint returns 401', async () => {
    const res = await request(app)
      .get(`/api/config/${TEST_CONFIG_KEY}`);
    expect(res.status).toBe(401);
  });
});
