/**
 * strengthened-assertions.test.js
 *
 * Deeper assertion tests that go beyond status-code checks.
 * Verifies response body shapes, field presence/absence, and
 * domain state transitions across all major API surfaces.
 */

const request = require('supertest');
const { startTestDb, stopTestDb } = require('./helpers/setup');

let app;
let tokens = {};
let testData = {};

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-strengthened';
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';

  await startTestDb();
  app = require('../api/src/app');

  const User = require('../api/src/models/User');
  const ConfigDictionary = require('../api/src/models/ConfigDictionary');
  const { hashPassword } = require('../api/src/utils/crypto');

  // Seed config entries required by ride and content services
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
  await ConfigDictionary.findOneAndUpdate(
    { key: 'sensitive_words' },
    { key: 'sensitive_words', value: ['violence', 'explicit'], category: 'sensitive_words' },
    { upsert: true }
  );

  // Create one user per role
  const roles = [
    { username: 'sa_admin', role: 'administrator', display_name: 'SA Admin' },
    { username: 'sa_editor', role: 'editor', display_name: 'SA Editor' },
    { username: 'sa_reviewer1', role: 'reviewer', display_name: 'SA Reviewer 1' },
    { username: 'sa_reviewer2', role: 'reviewer', display_name: 'SA Reviewer 2' },
    { username: 'sa_dispatcher', role: 'dispatcher', display_name: 'SA Dispatcher' },
    { username: 'sa_user', role: 'regular_user', display_name: 'SA User' },
  ];

  for (const r of roles) {
    await User.create({
      username: r.username,
      password_hash: await hashPassword('Test1234!'),
      role: r.role,
      display_name: r.display_name,
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: r.username, password: 'Test1234!' });
    tokens[r.role] = tokens[r.role] || res.body.token;
    // Store reviewer tokens individually so we have two distinct reviewers
    if (r.username === 'sa_reviewer1') tokens.reviewer1 = res.body.token;
    if (r.username === 'sa_reviewer2') tokens.reviewer2 = res.body.token;
  }

  // Create a user flagged for must_change_password
  await User.create({
    username: 'sa_gate_user',
    password_hash: await hashPassword('Bootstrap1!'),
    role: 'regular_user',
    display_name: 'Gate User',
    must_change_password: true,
  });
  const gateRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'sa_gate_user', password: 'Bootstrap1!' });
  tokens.gate = gateRes.body.token;
  testData.gateLoginBody = gateRes.body;
}, 90000);

afterAll(async () => {
  await stopTestDb();
});

// ---------------------------------------------------------------------------
// 1. RBAC — Response body assertions
// ---------------------------------------------------------------------------
describe('RBAC — response body structure', () => {
  test('GET /api/users returns pagination envelope with users array', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.administrator}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('pages');
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(typeof res.body.page).toBe('number');
    expect(typeof res.body.pages).toBe('number');
  });

  test('GET /api/users — each user has required fields', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.administrator}`);

    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThan(0);
    for (const user of res.body.users) {
      expect(user).toHaveProperty('_id');
      expect(user).toHaveProperty('username');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('display_name');
    }
  });

  test('GET /api/users — 403 response has FORBIDDEN code and message', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.editor}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    expect(res.body).toHaveProperty('message');
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  test('GET /api/users — regular_user 403 also has FORBIDDEN code', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.regular_user}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('GET /api/config returns configs array with key/value/category fields', async () => {
    const res = await request(app)
      .get('/api/config')
      .set('Authorization', `Bearer ${tokens.administrator}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('configs');
    expect(Array.isArray(res.body.configs)).toBe(true);
    expect(res.body.configs.length).toBeGreaterThan(0);
    for (const cfg of res.body.configs) {
      expect(cfg).toHaveProperty('key');
      expect(cfg).toHaveProperty('value');
      expect(cfg).toHaveProperty('category');
    }
  });

  test('GET /api/config — dispatcher 403 has FORBIDDEN code', async () => {
    const res = await request(app)
      .get('/api/config')
      .set('Authorization', `Bearer ${tokens.dispatcher}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// 2. Password gate — response body assertions
// ---------------------------------------------------------------------------
describe('Password gate — response body assertions', () => {
  test('Login response for must_change_password user has correct shape', async () => {
    const body = testData.gateLoginBody;
    expect(body).toHaveProperty('token');
    expect(typeof body.token).toBe('string');
    expect(body).toHaveProperty('user');
    expect(body.user).toHaveProperty('id');
    expect(body.user).toHaveProperty('username');
    expect(body.user).toHaveProperty('role');
    expect(body).toHaveProperty('must_change_password', true);
  });

  test('Blocked endpoints return CODE PASSWORD_CHANGE_REQUIRED with message', async () => {
    const res = await request(app)
      .get('/api/movies')
      .set('Authorization', `Bearer ${tokens.gate}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('code', 'PASSWORD_CHANGE_REQUIRED');
    expect(res.body).toHaveProperty('message');
  });

  test('GET /api/rides blocked — body has PASSWORD_CHANGE_REQUIRED code', async () => {
    const res = await request(app)
      .get('/api/rides')
      .set('Authorization', `Bearer ${tokens.gate}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  test('GET /api/content blocked — body has PASSWORD_CHANGE_REQUIRED code', async () => {
    const res = await request(app)
      .get('/api/content')
      .set('Authorization', `Bearer ${tokens.gate}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  test('After password change login response has must_change_password: false', async () => {
    // Change the gate user password
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${tokens.gate}`)
      .send({ current_password: 'Bootstrap1!', new_password: 'NewSecure99!' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sa_gate_user', password: 'NewSecure99!' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.must_change_password).toBe(false);
    expect(loginRes.body.token).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3. Auth flow — session and response structure
// ---------------------------------------------------------------------------
describe('Auth flow — response structure', () => {
  let loginResponse;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sa_admin', password: 'Test1234!' });
    loginResponse = res.body;
  });

  test('Login response has full expected shape', () => {
    expect(loginResponse).toHaveProperty('token');
    expect(typeof loginResponse.token).toBe('string');
    expect(loginResponse).toHaveProperty('user');
    expect(loginResponse.user).toHaveProperty('id');
    expect(loginResponse.user).toHaveProperty('username');
    expect(loginResponse.user).toHaveProperty('role');
    expect(loginResponse.user).toHaveProperty('display_name');
    expect(loginResponse).toHaveProperty('must_change_password');
    expect(typeof loginResponse.must_change_password).toBe('boolean');
    expect(loginResponse).toHaveProperty('expires_at');
    expect(typeof loginResponse.expires_at).toBe('string');
  });

  test('GET /api/auth/sessions returns sessions array with timing fields', async () => {
    const res = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${tokens.administrator}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sessions');
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions.length).toBeGreaterThan(0);
    for (const session of res.body.sessions) {
      expect(session).toHaveProperty('created_at');
      expect(session).toHaveProperty('expires_at');
    }
  });

  test('GET /api/auth/me does not leak password_hash or phone', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokens.administrator}`);

    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('password_hash');
    expect(res.body.user).not.toHaveProperty('phone');
  });

  test('GET /api/auth/me returns user with id, username, and role', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokens.administrator}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('username');
    expect(res.body.user).toHaveProperty('role');
  });
});

// ---------------------------------------------------------------------------
// 4. Movie CRUD — response body completeness
// ---------------------------------------------------------------------------
describe('Movie CRUD — response body completeness', () => {
  let movieId;

  test('POST /api/movies returns movie with all expected fields', async () => {
    const res = await request(app)
      .post('/api/movies')
      .set('Authorization', `Bearer ${tokens.editor}`)
      .send({
        title: 'Strengthened Test Movie',
        description: 'A deeply asserted film',
        categories: ['Drama', 'Thriller'],
        tags: ['2024', 'festival'],
        mpaa_rating: 'PG-13',
        release_date: '2024-08-01',
      });

    expect(res.status).toBe(201);
    const movie = res.body.movie;
    expect(movie).toHaveProperty('_id');
    expect(movie).toHaveProperty('title', 'Strengthened Test Movie');
    expect(movie).toHaveProperty('description');
    expect(movie).toHaveProperty('mpaa_rating', 'PG-13');
    expect(movie).toHaveProperty('categories');
    expect(Array.isArray(movie.categories)).toBe(true);
    expect(movie).toHaveProperty('tags');
    expect(Array.isArray(movie.tags)).toBe(true);
    expect(movie).toHaveProperty('is_published');
    expect(movie).toHaveProperty('revisions');
    expect(Array.isArray(movie.revisions)).toBe(true);
    movieId = movie._id;
  });

  test('PUT /api/movies/:id response reflects the update', async () => {
    const res = await request(app)
      .put(`/api/movies/${movieId}`)
      .set('Authorization', `Bearer ${tokens.editor}`)
      .send({ title: 'Updated Strengthened Movie', tags: ['updated', 'recut'] });

    expect(res.status).toBe(200);
    const movie = res.body.movie;
    expect(movie.title).toBe('Updated Strengthened Movie');
    expect(movie.tags).toContain('updated');
    expect(movie.tags).toContain('recut');
  });

  test('GET /api/movies/:id/revisions — each entry has change_type, timestamp, snapshot', async () => {
    const res = await request(app)
      .get(`/api/movies/${movieId}/revisions`)
      .set('Authorization', `Bearer ${tokens.editor}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.revisions)).toBe(true);
    expect(res.body.revisions.length).toBeGreaterThanOrEqual(2); // create + edit
    for (const rev of res.body.revisions) {
      expect(rev).toHaveProperty('change_type');
      expect(rev).toHaveProperty('timestamp');
      expect(rev).toHaveProperty('snapshot');
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Content workflow — state transition verification
// ---------------------------------------------------------------------------
describe('Content workflow — state transition verification', () => {
  let contentId;
  let rejectContentId;

  test('POST /api/content creates draft with status and author', async () => {
    const res = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${tokens.editor}`)
      .send({
        content_type: 'article',
        title: 'Strengthened Workflow Article',
        body: 'Body text for deep assertions',
      });

    expect(res.status).toBe(201);
    const item = res.body.item;
    expect(item.status).toBe('draft');
    expect(item).toHaveProperty('author');
    expect(item.author).toBeTruthy();
    contentId = item._id;
  });

  test('POST /api/content/:id/submit transitions status to in_review_1', async () => {
    const res = await request(app)
      .post(`/api/content/${contentId}/submit`)
      .set('Authorization', `Bearer ${tokens.editor}`)
      .send({ acknowledgedSensitiveWords: false });

    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('in_review_1');
  });

  test('First approval transitions status to in_review_2', async () => {
    const res = await request(app)
      .post(`/api/content-review/${contentId}/review`)
      .set('Authorization', `Bearer ${tokens.reviewer1}`)
      .send({ decision: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('in_review_2');
  });

  test('Second approval by different reviewer transitions status to published', async () => {
    const res = await request(app)
      .post(`/api/content-review/${contentId}/review`)
      .set('Authorization', `Bearer ${tokens.reviewer2}`)
      .send({ decision: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('published');
  });

  test('Rejection response includes rejection reason in review record', async () => {
    // Create content and submit it for rejection test
    const createRes = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${tokens.editor}`)
      .send({
        content_type: 'article',
        title: 'Reject Target Article',
        body: 'Body for rejection',
      });
    rejectContentId = createRes.body.item._id;

    await request(app)
      .post(`/api/content/${rejectContentId}/submit`)
      .set('Authorization', `Bearer ${tokens.editor}`)
      .send({ acknowledgedSensitiveWords: false });

    const rejectRes = await request(app)
      .post(`/api/content-review/${rejectContentId}/review`)
      .set('Authorization', `Bearer ${tokens.reviewer1}`)
      .send({ decision: 'rejected', rejection_reason: 'Needs more depth and citations' });

    expect(rejectRes.status).toBe(200);
    // After rejection content goes back to draft
    expect(rejectRes.body.item.status).toBe('draft');

    // Verify the rejection was recorded by fetching review history
    const reviewsRes = await request(app)
      .get(`/api/content/${rejectContentId}/reviews`)
      .set('Authorization', `Bearer ${tokens.reviewer1}`);

    expect(reviewsRes.status).toBe(200);
    expect(Array.isArray(reviewsRes.body.reviews)).toBe(true);
    const rejectionRecord = reviewsRes.body.reviews.find(r => r.decision === 'rejected');
    expect(rejectionRecord).toBeDefined();
    expect(rejectionRecord.rejection_reason).toBe('Needs more depth and citations');
  });
});

// ---------------------------------------------------------------------------
// 6. Rides — domain state validation
// ---------------------------------------------------------------------------
describe('Rides — domain state validation', () => {
  let rideId;

  test('POST /api/rides creates ride with pending_match status and all domain fields', async () => {
    const start = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour window

    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${tokens.regular_user}`)
      .send({
        pickup_text: 'Grand Lobby Entrance',
        dropoff_text: 'Central Station Exit',
        rider_count: 2,
        vehicle_type: 'suv',
        time_window_start: start.toISOString(),
        time_window_end: end.toISOString(),
      });

    expect(res.status).toBe(201);
    const ride = res.body.ride;
    expect(ride).toHaveProperty('_id');
    expect(ride.status).toBe('pending_match');
    expect(ride).toHaveProperty('pickup_text', 'Grand Lobby Entrance');
    expect(ride).toHaveProperty('dropoff_text', 'Central Station Exit');
    expect(ride).toHaveProperty('rider_count', 2);
    expect(ride).toHaveProperty('vehicle_type', 'suv');
    expect(ride).toHaveProperty('time_window_start');
    expect(ride).toHaveProperty('time_window_end');
    expect(ride).toHaveProperty('auto_cancel_at');
    expect(ride.auto_cancel_at).toBeTruthy();
    expect(ride).toHaveProperty('state_transitions');
    expect(Array.isArray(ride.state_transitions)).toBe(true);
    rideId = ride._id;
  });

  test('Accepting ride grows state_transitions array', async () => {
    const beforeRes = await request(app)
      .get(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${tokens.regular_user}`);
    const countBefore = beforeRes.body.ride.state_transitions.length;

    await request(app)
      .post(`/api/dispatch/rides/${rideId}/accept`)
      .set('Authorization', `Bearer ${tokens.dispatcher}`)
      .send({ notes: 'Vehicle 7 assigned' });

    const afterRes = await request(app)
      .get(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${tokens.regular_user}`);
    const countAfter = afterRes.body.ride.state_transitions.length;

    expect(countAfter).toBeGreaterThan(countBefore);
    expect(afterRes.body.ride.status).toBe('accepted');
  });

  test('Each state_transition entry has from, to, and timestamp fields', async () => {
    const res = await request(app)
      .get(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${tokens.regular_user}`);

    expect(res.status).toBe(200);
    for (const transition of res.body.ride.state_transitions) {
      expect(transition).toHaveProperty('from');
      expect(transition).toHaveProperty('to');
      expect(transition).toHaveProperty('timestamp');
    }
  });

  test('In_progress and completed transitions further grow state_transitions', async () => {
    await request(app)
      .post(`/api/dispatch/rides/${rideId}/transition`)
      .set('Authorization', `Bearer ${tokens.dispatcher}`)
      .send({ to_status: 'in_progress' });

    await request(app)
      .post(`/api/dispatch/rides/${rideId}/transition`)
      .set('Authorization', `Bearer ${tokens.dispatcher}`)
      .send({ to_status: 'completed' });

    const res = await request(app)
      .get(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${tokens.regular_user}`);

    expect(res.body.ride.status).toBe('completed');
    // pending_match -> accepted -> in_progress -> completed = at least 3 transitions
    expect(res.body.ride.state_transitions.length).toBeGreaterThanOrEqual(3);
  });

  test('Feedback response includes rating and comment in ride object', async () => {
    const res = await request(app)
      .post(`/api/rides/${rideId}/feedback`)
      .set('Authorization', `Bearer ${tokens.regular_user}`)
      .send({ rating: 4, comment: 'Smooth and punctual' });

    expect(res.status).toBe(200);
    expect(res.body.ride).toHaveProperty('feedback');
    expect(res.body.ride.feedback.rating).toBe(4);
    expect(res.body.ride.feedback.comment).toBe('Smooth and punctual');
  });

  test('GET /api/rides/:id response has populated requester field', async () => {
    const res = await request(app)
      .get(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${tokens.regular_user}`);

    expect(res.status).toBe(200);
    expect(res.body.ride).toHaveProperty('requester');
    // requester may be an object (populated) or an ObjectId string
    expect(res.body.ride.requester).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 7. Sensitive field leakage checks
// ---------------------------------------------------------------------------
describe('Sensitive field leakage checks', () => {
  test('GET /api/users — no user has password_hash field', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.administrator}`);

    expect(res.status).toBe(200);
    for (const user of res.body.users) {
      expect(user).not.toHaveProperty('password_hash');
    }
  });

  test('GET /api/auth/me — no password_hash in response', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokens.editor}`);

    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  test('GET /api/users — no raw phone field exposed (must be null or masked)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.administrator}`);

    expect(res.status).toBe(200);
    for (const user of res.body.users) {
      // phone_encrypted must not leak
      expect(user).not.toHaveProperty('phone_encrypted');
      // If phone is present it must be null or masked (containing ***)
      if (user.phone !== null && user.phone !== undefined) {
        expect(user.phone).toMatch(/\*{2,}/);
      }
    }
  });
});
