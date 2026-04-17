/**
 * CineRide — Extended E2E Workflow Tests
 *
 * Covers real FE↔BE flows:
 *   1. Login + forced password change
 *   2. Create / edit movie
 *   3. Create and publish content (two-step review)
 *   4. Create and cancel a ride
 *   5. Admin config key CRUD via API
 *
 * Run:
 *   E2E_ADMIN_PASSWORD=<secret> E2E_BASE_URL=http://localhost:8080 \
 *     npx playwright test e2e/workflows.spec.js
 */

const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'DemoEditor123!';

// ─── shared helpers ──────────────────────────────────────────────────────────

async function apiLogin(request, username, password, portal = null) {
  const payload = { username, password };
  if (portal) payload.portal = portal;
  const res = await request.post(`${BASE}/api/auth/login`, { data: payload });
  if (!res.ok()) return null;
  const body = await res.json();
  return body.token;
}

async function apiCreateUser(request, token, userData) {
  const res = await request.post(`${BASE}/api/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: userData
  });
  if (!res.ok()) return null;
  const body = await res.json();
  return body.user;
}

/**
 * Log into any portal via the browser login form and wait for redirect to the
 * post-login path.  Returns when the URL matches the expected pattern.
 */
async function browserLogin(page, portalPath, username, password, expectUrlPattern = /dashboard/) {
  await page.goto(`${BASE}${portalPath}`);
  await page.fill('input[placeholder="Enter your username"]', username);
  await page.fill('input[placeholder="Enter your password"]', password);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL(expectUrlPattern, { timeout: 15000 });
}

/**
 * Build a future datetime-local string (minutes from now).
 */
function futureLocal(offsetMinutes) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  // datetime-local format: YYYY-MM-DDTHH:MM
  return d.toISOString().slice(0, 16);
}

// ─── 1. Login and forced password change flow ────────────────────────────────

test.describe('1. Forced password change flow', () => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, 'needs E2E_ADMIN_PASSWORD');

  const tempUser = `e2e_pw_${Date.now()}`;
  const tempPass = E2E_PASSWORD;
  const newPass = 'NewSecure77!';
  let adminToken;

  test.beforeAll(async ({ request }) => {
    adminToken = await apiLogin(request, 'admin', process.env.E2E_ADMIN_PASSWORD, 'admin');
    expect(adminToken, 'admin login should succeed').toBeTruthy();

    const created = await apiCreateUser(request, adminToken, {
      username: tempUser,
      password: tempPass,
      role: 'regular_user',
      display_name: 'Temp PW User',
      must_change_password: true
    });
    expect(created, 'temp user should be created').toBeTruthy();
  });

  test('forced-change gate intercepts login and accepts new password', async ({ page }) => {
    // Navigate to user portal and sign in
    await page.goto(`${BASE}/login`);
    await page.fill('input[placeholder="Enter your username"]', tempUser);
    await page.fill('input[placeholder="Enter your password"]', tempPass);
    await page.click('button:has-text("Sign In")');

    // The app should show the password-change gate (not the normal dashboard)
    await expect(page.locator('text=Password Change Required')).toBeVisible({ timeout: 10000 });

    // Fill the change form
    await page.fill('input[type="password"]:near(:text("Current Password"))', tempPass);
    await page.fill('input[type="password"]:near(:text("New Password"))', newPass);
    await page.fill('input[type="password"]:near(:text("Confirm"))', newPass);
    await page.click('button:has-text("Set New Password")');

    // After a successful change the user lands on dashboard
    await page.waitForURL(/dashboard/, { timeout: 10000 });
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test.afterAll(async ({ request }) => {
    // Clean up: look up user by username, then delete by ID
    if (!adminToken) return;
    try {
      const listRes = await request.get(`${BASE}/api/users?search=${tempUser}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (listRes.ok()) {
        const body = await listRes.json();
        const user = (body.users || []).find(u => u.username === tempUser);
        if (user?._id) {
          await request.delete(`${BASE}/api/users/${user._id}`, {
            headers: { Authorization: `Bearer ${adminToken}` }
          });
        }
      }
    } catch {}
  });
});

// ─── 2. Create / edit movie workflow ─────────────────────────────────────────

test.describe('2. Create and edit movie', () => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, 'needs E2E_ADMIN_PASSWORD');

  const movieTitle = `E2E Movie ${Date.now()}`;
  const updatedTitle = `${movieTitle} (edited)`;

  test('editor creates a movie, it appears in list, and edit updates title', async ({ page, request }) => {
    // Confirm e2e_editor account is available
    const token = await apiLogin(request, 'e2e_editor', E2E_PASSWORD, 'editor');
    test.skip(!token, 'e2e_editor not available — run smoke setup first');

    // Browser login as editor
    await browserLogin(page, '/editor/login', 'e2e_editor', E2E_PASSWORD);

    // Navigate to Movies page
    await page.click('nav >> text=Movies');
    await page.waitForURL(/movies/, { timeout: 8000 });

    // Open the create modal
    await page.click('button:has-text("+ Add Movie")');
    await expect(page.locator('text=Add Movie')).toBeVisible({ timeout: 5000 });

    // Fill the form
    await page.fill('input[required]', movieTitle);           // Title field
    const descArea = page.locator('textarea').first();
    await descArea.fill('An automated end-to-end test movie');
    await page.selectOption('select', 'PG-13');               // MPAA Rating

    // Submit
    await page.click('button:has-text("Create Movie")');

    // Modal closes and the new movie appears in the list
    await expect(page.locator(`text=${movieTitle}`)).toBeVisible({ timeout: 8000 });

    // Click the movie card/row to open detail modal
    await page.click(`text=${movieTitle}`);
    await expect(page.locator(`h2:has-text("${movieTitle}")`)).toBeVisible({ timeout: 5000 });

    // Open edit
    await page.click('button:has-text("Edit Metadata")');
    await expect(page.locator(`text=Edit: ${movieTitle}`)).toBeVisible({ timeout: 5000 });

    // Clear title and type new one
    const titleInput = page.locator('input[required]').first();
    await titleInput.clear();
    await titleInput.fill(updatedTitle);

    await page.click('button:has-text("Save Changes")');

    // After save, the detail modal re-appears with the updated title
    await expect(page.locator(`h2:has-text("${updatedTitle}")`)).toBeVisible({ timeout: 8000 });
  });
});

// ─── 3. Create and publish content (two-step review) ─────────────────────────

test.describe('3. Content create → review → publish', () => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, 'needs E2E_ADMIN_PASSWORD');

  const contentTitle = `E2E Content ${Date.now()}`;
  let contentId;

  test('editor creates draft, submits for review, two reviewers approve, content publishes', async ({
    page,
    request
  }) => {
    const editorToken = await apiLogin(request, 'e2e_editor', E2E_PASSWORD, 'editor');
    test.skip(!editorToken, 'e2e_editor not available — run smoke setup first');

    // ── Step A: create draft via browser ────────────────────────────────────
    await browserLogin(page, '/editor/login', 'e2e_editor', E2E_PASSWORD);
    await page.click('nav >> text=Content');
    await page.waitForURL(/content/, { timeout: 8000 });

    // Open create modal
    await page.click('button:has-text("+ New Content")');
    await expect(page.locator('text=Create Content')).toBeVisible({ timeout: 5000 });

    await page.selectOption('select[id="content_type"], select', 'article');
    const titleField = page.locator('input[placeholder*="title" i], input[required]').first();
    await titleField.fill(contentTitle);
    const bodyArea = page.locator('textarea').first();
    await bodyArea.fill('This is body text for an automated e2e test.');
    await page.click('button:has-text("Create")');

    // Draft should appear in the list
    await expect(page.locator(`text=${contentTitle}`)).toBeVisible({ timeout: 8000 });

    // ── Step B: submit for review via API (faster and deterministic) ─────────
    // Fetch all content to locate the newly created item
    const listRes = await request.get(`${BASE}/api/content?limit=5`, {
      headers: { Authorization: `Bearer ${editorToken}` }
    });
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    const item = (listBody.items || []).find(i => i.title === contentTitle);
    expect(item, 'newly created content item must exist').toBeTruthy();
    contentId = item._id;

    // Submit for review
    const submitRes = await request.post(`${BASE}/api/content/${contentId}/submit`, {
      headers: { Authorization: `Bearer ${editorToken}` },
      data: { acknowledgedSensitiveWords: false }
    });
    expect(submitRes.ok(), 'submit for review should succeed').toBeTruthy();
    const submitBody = await submitRes.json();
    expect(submitBody.item?.status).toBe('in_review_1');

    // ── Step C: reviewer1 approves step 1 ───────────────────────────────────
    const reviewer1Token = await apiLogin(request, 'e2e_reviewer', E2E_PASSWORD, 'reviewer');
    test.skip(!reviewer1Token, 'e2e_reviewer not available — run smoke setup first');

    const rev1Res = await request.post(`${BASE}/api/content-review/${contentId}/review`, {
      headers: { Authorization: `Bearer ${reviewer1Token}` },
      data: { decision: 'approved' }
    });
    expect(rev1Res.ok(), 'step-1 approval should succeed').toBeTruthy();
    const rev1Body = await rev1Res.json();
    expect(rev1Body.item?.status).toBe('in_review_2');

    // ── Step D: reviewer2 approves step 2 (must be a different user) ────────
    // We'll use an admin-role user for the second review since there is only one
    // e2e_reviewer account provisioned by the smoke suite.  Admins can also review.
    const adminToken = await apiLogin(request, 'admin', process.env.E2E_ADMIN_PASSWORD, 'admin');
    expect(adminToken, 'admin login should succeed').toBeTruthy();

    const rev2Res = await request.post(`${BASE}/api/content-review/${contentId}/review`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { decision: 'approved' }
    });
    expect(rev2Res.ok(), 'step-2 approval should succeed').toBeTruthy();
    const rev2Body = await rev2Res.json();
    // No scheduled_publish_date set → should be published immediately
    expect(rev2Body.item?.status).toBe('published');

    // ── Step E: confirm via GET ──────────────────────────────────────────────
    const getRes = await request.get(`${BASE}/api/content/${contentId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(getRes.ok()).toBeTruthy();
    const getBody = await getRes.json();
    expect(getBody.item?.status).toBe('published');
  });
});

// ─── 4. Create and cancel ride ───────────────────────────────────────────────

test.describe('4. Create and cancel ride (within free window)', () => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, 'needs E2E_ADMIN_PASSWORD');

  test('user creates a ride, sees pending_match status, then cancels it for free', async ({
    page,
    request
  }) => {
    const userToken = await apiLogin(request, 'e2e_user', E2E_PASSWORD);
    test.skip(!userToken, 'e2e_user not available — run smoke setup first');

    // Browser login as regular user
    await browserLogin(page, '/login', 'e2e_user', E2E_PASSWORD);

    // Navigate to Rides
    await page.click('nav >> text=Rides');
    await page.waitForURL(/rides/, { timeout: 8000 });

    // Open the create modal
    await page.click('button:has-text("+ New Ride")');
    await expect(page.locator('text=New Ride Request')).toBeVisible({ timeout: 5000 });

    // Fill pickup / dropoff
    await page.fill('input[placeholder*="Pickup" i]', 'Terminal A');
    await page.fill('input[placeholder*="Drop" i]', 'Parking Lot C');

    // Time window: start 10 min from now, end 1 hour after start
    const windowStart = futureLocal(10);
    const windowEnd = futureLocal(70);
    await page.fill('input[type="datetime-local"]:nth-of-type(1)', windowStart);
    await page.fill('input[type="datetime-local"]:nth-of-type(2)', windowEnd);

    // Submit
    await page.click('button:has-text("Submit Request")');

    // Ride should appear in the table with pending_match badge
    await expect(page.locator('text=Terminal A')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=pending_match')).toBeVisible({ timeout: 5000 });

    // Click cancel (free window) — the button should be labeled "Cancel (free)"
    const cancelBtn = page.locator('button:has-text("Cancel (free)")').first();
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    await cancelBtn.click();

    // After cancel the ride status should change to "canceled"
    await expect(page.locator('text=canceled')).toBeVisible({ timeout: 8000 });
  });
});

// ─── 5. Admin config key CRUD via API ────────────────────────────────────────

test.describe('5. Config key CRUD (admin API)', () => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, 'needs E2E_ADMIN_PASSWORD');

  const configKey = `e2e_test_key_${Date.now()}`;
  let adminToken;

  test.beforeAll(async ({ request }) => {
    adminToken = await apiLogin(request, 'admin', process.env.E2E_ADMIN_PASSWORD, 'admin');
    expect(adminToken, 'admin login should succeed').toBeTruthy();
  });

  test('create a config key via POST /api/config', async ({ request }) => {
    const res = await request.post(`${BASE}/api/config`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        key: configKey,
        value: 'initial_value',
        category: 'general',
        description: 'E2E test key'
      }
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.config?.key).toBe(configKey);
    expect(body.config?.value).toBe('initial_value');
  });

  test('GET /api/config/:key returns the created value', async ({ request }) => {
    const res = await request.get(`${BASE}/api/config/${configKey}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.key).toBe(configKey);
    expect(body.value).toBe('initial_value');
  });

  test('PUT /api/config/:key updates the value', async ({ request }) => {
    const res = await request.put(`${BASE}/api/config/${configKey}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { value: 'updated_value' }
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.config?.value).toBe('updated_value');
  });

  test('GET /api/config/:key reflects the updated value', async ({ request }) => {
    const res = await request.get(`${BASE}/api/config/${configKey}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.value).toBe('updated_value');
  });

  test('DELETE /api/config/:key removes the key (non-protected)', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/config/${configKey}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res.ok()).toBeTruthy();

    // Subsequent GET returns 404
    const getRes = await request.get(`${BASE}/api/config/${configKey}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(getRes.status()).toBe(404);
  });

  test('DELETE /api/config/:key rejects protected keys', async ({ request }) => {
    const protectedKey = 'free_cancel_window_minutes';
    const res = await request.delete(`${BASE}/api/config/${protectedKey}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    // Protected key deletion must return 422 (ValidationError)
    expect(res.status()).toBe(422);
  });
});
