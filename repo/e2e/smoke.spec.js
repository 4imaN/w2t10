const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'E2eTestPass99!';

async function apiLogin(request, username, password, portal) {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { username, password, portal }
  });
  if (!res.ok()) return null;
  const body = await res.json();
  return body.token;
}

async function apiCreateUser(request, token, userData) {
  const res = await request.post(`${BASE}/api/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: userData
  });
  return res.ok();
}

test.describe('API Health', () => {
  test('health endpoint responds', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});

test.describe('E2E Setup — Create test accounts', () => {
  test('can read bootstrap credentials and create test users', async ({ request }) => {
    test.skip(!process.env.E2E_ADMIN_PASSWORD, 'E2E_ADMIN_PASSWORD not set — skip account setup');

    const adminToken = await apiLogin(request, 'admin', process.env.E2E_ADMIN_PASSWORD, 'admin');
    expect(adminToken).toBeTruthy();

    const testUsers = [
      { username: 'e2e_editor', password: E2E_PASSWORD, role: 'editor', display_name: 'E2E Editor' },
      { username: 'e2e_reviewer', password: E2E_PASSWORD, role: 'reviewer', display_name: 'E2E Reviewer' },
      { username: 'e2e_dispatcher', password: E2E_PASSWORD, role: 'dispatcher', display_name: 'E2E Dispatcher' },
      { username: 'e2e_user', password: E2E_PASSWORD, role: 'regular_user', display_name: 'E2E User' },
    ];

    for (const u of testUsers) {
      await apiCreateUser(request, adminToken, u);
    }
  });
});

test.describe('Login Portal Rendering', () => {
  test('admin portal shows correct theme', async ({ page }) => {
    await page.goto(`${BASE}/admin/login`);
    await expect(page.locator('text=Admin Control Center')).toBeVisible();
  });

  test('editor portal shows correct theme', async ({ page }) => {
    await page.goto(`${BASE}/editor/login`);
    await expect(page.locator('text=CineRide Studio')).toBeVisible();
  });

  test('user portal shows correct theme', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator('text=Movies, Content & Rides')).toBeVisible();
  });

  test('wrong portal rejects login', async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_PASSWORD, 'needs E2E_ADMIN_PASSWORD');

    await page.goto(`${BASE}/login`);
    await page.fill('input[placeholder="Enter your username"]', 'admin');
    await page.fill('input[placeholder="Enter your password"]', process.env.E2E_ADMIN_PASSWORD);
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('text=does not match')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Authenticated Flows', () => {
  test.skip(!process.env.E2E_ADMIN_PASSWORD, 'needs E2E_ADMIN_PASSWORD for authenticated tests');

  test('editor can access content page', async ({ page, request }) => {
    const token = await apiLogin(request, 'e2e_editor', E2E_PASSWORD, 'editor');
    test.skip(!token, 'e2e_editor not available');

    await page.goto(`${BASE}/editor/login`);
    await page.fill('input[placeholder="Enter your username"]', 'e2e_editor');
    await page.fill('input[placeholder="Enter your password"]', E2E_PASSWORD);
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/dashboard/, { timeout: 10000 });

    await page.click('nav >> text=Content');
    await page.waitForURL(/content/);
    await expect(page.locator('text=Content')).toBeVisible();
  });

  test('dispatcher sees dispatch center', async ({ page, request }) => {
    const token = await apiLogin(request, 'e2e_dispatcher', E2E_PASSWORD, 'dispatcher');
    test.skip(!token, 'e2e_dispatcher not available');

    await page.goto(`${BASE}/dispatcher/login`);
    await page.fill('input[placeholder="Enter your username"]', 'e2e_dispatcher');
    await page.fill('input[placeholder="Enter your password"]', E2E_PASSWORD);
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/dashboard/, { timeout: 10000 });

    await page.click('nav >> text=Dispatch');
    await page.waitForURL(/dispatch/);
    await expect(page.locator('text=Dispatch Center')).toBeVisible();
  });
});
