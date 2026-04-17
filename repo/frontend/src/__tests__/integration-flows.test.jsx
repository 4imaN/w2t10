import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import App from '../App';

// ─── Global fetch mock ────────────────────────────────────────────────────────
// The api.js service calls `fetch` internally. We intercept at this level so
// the real api module wiring (headers, token injection, 401 handling) is
// exercised end-to-end without the module being mocked away.
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function setAuth(role, displayName) {
  const user = {
    _id: 'test-id',
    username: `test_${role}`,
    role,
    display_name: displayName || role,
  };
  // Also populate sessionStorage so api.js can read the token
  sessionStorage.setItem('cineride_token', 'fake-jwt-token');
  sessionStorage.setItem('cineride_user', JSON.stringify(user));
  useAuthStore.setState({
    user,
    token: 'fake-jwt-token',
    mustChangePassword: false,
  });
}

function clearAuth() {
  sessionStorage.removeItem('cineride_token');
  sessionStorage.removeItem('cineride_user');
  useAuthStore.setState({ user: null, token: null, mustChangePassword: false });
}

// ─── Render helper ────────────────────────────────────────────────────────────
function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

// ─── Network helpers ──────────────────────────────────────────────────────────
function mockFetchResponse(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

/**
 * Sets up a broad default implementation for mockFetch so that every API
 * call a page might fire during mount returns a valid, well-shaped empty
 * response. Individual tests can override specific URLs on top of this
 * baseline via mockFetch.mockImplementation, or by calling this first and
 * then chaining .mockImplementationOnce where needed.
 */
function setupDefaultFetchMocks() {
  mockFetch.mockImplementation((url) => {
    if (url.includes('/rides')) return mockFetchResponse({ rides: [], total: 0, pages: 1 });
    if (url.includes('/content')) return mockFetchResponse({ items: [], total: 0, pages: 1 });
    if (url.includes('/recommendations')) return mockFetchResponse({ movies: [] });
    if (url.includes('/movies')) return mockFetchResponse({ movies: [], total: 0, pages: 1 });
    if (url.includes('/users')) return mockFetchResponse({ users: [], total: 0, pages: 1 });
    if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: [], total: 0 });
    if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: [], total: 0 });
    if (url.includes('/config')) return mockFetchResponse({ configs: [] });
    if (url.includes('/ledger')) return mockFetchResponse({ entries: [] });
    if (url.includes('/sensors')) return mockFetchResponse({ devices: [] });
    if (url.includes('/search')) return mockFetchResponse({ movies: [], content: [], users: [], total: 0 });
    return mockFetchResponse({});
  });
}

// ─── Global lifecycle ─────────────────────────────────────────────────────────
beforeEach(() => {
  clearAuth();
  mockFetch.mockReset();
});

afterEach(() => {
  // Ensure nothing leaks across tests
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — Unauthenticated user is redirected to login
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: unauthenticated redirect', () => {
  test('unauthenticated user visiting /movies sees the login form', () => {
    // No auth set — clearAuth() already ran in beforeEach
    // No fetch mock needed: the redirect happens before any API call
    renderApp('/movies');

    // The login form exposes an input labelled "Username" or contains "Sign In"
    const usernameInput = screen.queryByPlaceholderText(/enter your username/i);
    const signInBtn    = screen.queryByRole('button', { name: /sign in/i });
    expect(usernameInput || signInBtn).toBeTruthy();
  });

  test('unauthenticated user visiting /admin/users sees the login form', () => {
    renderApp('/admin/users');
    const usernameInput = screen.queryByPlaceholderText(/enter your username/i);
    const signInBtn    = screen.queryByRole('button', { name: /sign in/i });
    expect(usernameInput || signInBtn).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — Authenticated admin navigates to dashboard
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: admin dashboard', () => {
  test('admin auth + renderApp("/") shows welcome message on dashboard', async () => {
    setAuth('administrator', 'Alice Admin');
    setupDefaultFetchMocks();

    renderApp('/');

    // App redirects "/" → "/admin/dashboard" → DashboardPage which renders
    // "Welcome, <display_name>"
    await waitFor(() => {
      expect(screen.getByText(/welcome,\s*alice admin/i)).toBeInTheDocument();
    });
  });

  test('admin dashboard shows all four metric card labels', async () => {
    setAuth('administrator', 'Alice Admin');
    setupDefaultFetchMocks();

    renderApp('/admin/dashboard');

    await waitFor(() => {
      expect(screen.getByText('Ride Requests')).toBeInTheDocument();
      expect(screen.getByText('Content Items')).toBeInTheDocument();
      expect(screen.getByText('Recommendations')).toBeInTheDocument();
      expect(screen.getByText('Role')).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 — Admin can navigate to Users page and sees "User Management"
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: admin users page', () => {
  test('admin renderApp("/admin/users") shows "User Management" heading', async () => {
    setAuth('administrator', 'Admin');
    setupDefaultFetchMocks();

    renderApp('/admin/users');

    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });
  });

  test('admin users page fetches /api/users on mount', async () => {
    setAuth('administrator', 'Admin');
    setupDefaultFetchMocks();

    renderApp('/admin/users');

    await waitFor(() => {
      const calls = mockFetch.mock.calls.map(([url]) => url);
      expect(calls.some((u) => u.includes('/users'))).toBe(true);
    });
  });

  test('admin users page renders user rows from fetch response', async () => {
    setAuth('administrator', 'Admin');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/users')) {
        return mockFetchResponse({
          users: [
            { _id: 'u1', username: 'jane_doe', display_name: 'Jane Doe', role: 'editor', phone: '', status: 'active' },
          ],
          total: 1,
          pages: 1,
        });
      }
      return mockFetchResponse({});
    });

    renderApp('/admin/users');

    await waitFor(() => {
      expect(screen.getByText('jane_doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4 — Editor sees Movies page with real data flow
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: editor movies page with data', () => {
  const sampleMovies = [
    { _id: 'mv1', title: 'Dune: Part Two', mpaa_rating: 'PG-13', is_published: true, categories: ['sci-fi'], release_date: '2024-03-01' },
    { _id: 'mv2', title: 'Oppenheimer', mpaa_rating: 'R', is_published: true, categories: ['drama'], release_date: '2023-07-21' },
  ];

  test('editor renderApp("/movies") shows fetched movie titles', async () => {
    setAuth('editor', 'Eddie Editor');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/movies')) {
        return mockFetchResponse({ movies: sampleMovies, total: 2, pages: 1 });
      }
      return mockFetchResponse({});
    });

    renderApp('/movies');

    await waitFor(() => {
      expect(screen.getByText('Dune: Part Two')).toBeInTheDocument();
      expect(screen.getByText('Oppenheimer')).toBeInTheDocument();
    });
  });

  test('editor movies page shows MPAA rating badges from API data', async () => {
    setAuth('editor', 'Eddie Editor');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/movies')) {
        return mockFetchResponse({ movies: sampleMovies, total: 2, pages: 1 });
      }
      return mockFetchResponse({});
    });

    renderApp('/movies');

    await waitFor(() => {
      // At least one PG-13 and R badge must appear
      expect(screen.getAllByText('PG-13').length).toBeGreaterThan(0);
      expect(screen.getAllByText('R').length).toBeGreaterThan(0);
    });
  });

  test('editor movies page shows "+ Add Movie" button (staff privilege)', async () => {
    setAuth('editor', 'Eddie Editor');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/movies')) return mockFetchResponse({ movies: [], total: 0, pages: 1 });
      return mockFetchResponse({});
    });

    renderApp('/movies');

    // The button renders synchronously based on role — no waitFor needed,
    // but the page does mount after the route resolves so a short wait is safe.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\+ add movie/i })).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5 — Regular user cannot access admin routes
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: regular_user blocked from admin routes', () => {
  test('regular_user renderApp("/admin/users") is redirected away — no "User Management" heading', async () => {
    setAuth('regular_user', 'Regular Ron');
    setupDefaultFetchMocks();

    renderApp('/admin/users');

    // After the route guard redirects, DashboardPage (the role dashboard) will
    // render. "User Management" must NOT appear in the document.
    await waitFor(() => {
      // Give the page time to settle then assert the admin heading is absent
      expect(screen.queryByText('User Management')).toBeNull();
    });
  });

  test('regular_user visiting /admin/config is redirected — no "System Config" text visible', async () => {
    setAuth('regular_user', 'Regular Ron');
    setupDefaultFetchMocks();

    renderApp('/admin/config');

    await waitFor(() => {
      expect(screen.queryByText(/system config/i)).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6 — Dispatcher sees Dispatch Center
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: dispatcher sees Dispatch Center', () => {
  test('dispatcher renderApp("/dispatch") shows "Dispatch Center" heading', async () => {
    setAuth('dispatcher', 'Dispatch Dave');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: [], total: 0 });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: [], total: 0 });
      return mockFetchResponse({});
    });

    renderApp('/dispatch');

    await waitFor(() => {
      expect(screen.getByText('Dispatch Center')).toBeInTheDocument();
    });
  });

  test('dispatcher dispatch page calls /api/dispatch/queue and /api/dispatch/disputes', async () => {
    setAuth('dispatcher', 'Dispatch Dave');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: [], total: 0 });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: [], total: 0 });
      return mockFetchResponse({});
    });

    renderApp('/dispatch');

    await waitFor(() => {
      const urls = mockFetch.mock.calls.map(([u]) => u);
      expect(urls.some((u) => u.includes('/dispatch/queue'))).toBe(true);
      expect(urls.some((u) => u.includes('/dispatch/disputes'))).toBe(true);
    });
  });

  test('dispatcher sees ride queue tab and disputes tab', async () => {
    setAuth('dispatcher', 'Dispatch Dave');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: [], total: 0 });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: [], total: 0 });
      return mockFetchResponse({});
    });

    renderApp('/dispatch');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ride queue/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /disputes/i })).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7 — Force password change gate blocks navigation
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: force password change gate', () => {
  test('user with mustChangePassword=true visiting /movies sees "Password Change Required"', () => {
    const user = { _id: 'u1', username: 'newuser', role: 'regular_user', display_name: 'New User' };
    sessionStorage.setItem('cineride_token', 'fake-jwt-token');
    sessionStorage.setItem('cineride_user', JSON.stringify(user));
    useAuthStore.setState({ user, token: 'fake-jwt-token', mustChangePassword: true });

    // No fetch mock needed — ForcePasswordChange renders synchronously before
    // any API calls reach the underlying page
    renderApp('/movies');

    expect(screen.getByText('Password Change Required')).toBeInTheDocument();
  });

  test('password change gate shows welcome with display_name', () => {
    const user = { _id: 'u2', username: 'staffer', role: 'editor', display_name: 'Staff Writer' };
    sessionStorage.setItem('cineride_token', 'fake-jwt-token');
    sessionStorage.setItem('cineride_user', JSON.stringify(user));
    useAuthStore.setState({ user, token: 'fake-jwt-token', mustChangePassword: true });

    renderApp('/content');

    // ForcePasswordChange renders: "Welcome, <display_name>. You must set..."
    expect(screen.getByText(/staff writer/i)).toBeInTheDocument();
  });

  test('password change gate blocks admin routes too', () => {
    const user = { _id: 'u3', username: 'adminnew', role: 'administrator', display_name: 'New Admin' };
    sessionStorage.setItem('cineride_token', 'fake-jwt-token');
    sessionStorage.setItem('cineride_user', JSON.stringify(user));
    useAuthStore.setState({ user, token: 'fake-jwt-token', mustChangePassword: true });

    renderApp('/admin/users');

    expect(screen.getByText('Password Change Required')).toBeInTheDocument();
    expect(screen.queryByText('User Management')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8 — Login page shows correct portal theme for /admin/login
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: login portal themes via App routing', () => {
  test('renderApp("/admin/login") shows "Admin Control Center" theme title', () => {
    // No auth — unauthenticated, clearAuth() already ran
    // LoginPage reads window.location.pathname for portal detection
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/admin/login', href: 'http://localhost/admin/login' },
      writable: true,
      configurable: true,
    });

    renderApp('/admin/login');

    expect(screen.getByText('Admin Control Center')).toBeInTheDocument();
  });

  test('renderApp("/editor/login") shows "CineRide Studio" theme title', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/editor/login', href: 'http://localhost/editor/login' },
      writable: true,
      configurable: true,
    });

    renderApp('/editor/login');

    expect(screen.getByText('CineRide Studio')).toBeInTheDocument();
  });

  test('renderApp("/dispatcher/login") shows "Dispatch Hub" theme title', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/dispatcher/login', href: 'http://localhost/dispatcher/login' },
      writable: true,
      configurable: true,
    });

    renderApp('/dispatcher/login');

    expect(screen.getByText('Dispatch Hub')).toBeInTheDocument();
  });

  test('renderApp("/login") shows default user portal subtitle', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/login', href: 'http://localhost/login' },
      writable: true,
      configurable: true,
    });

    renderApp('/login');

    expect(screen.getByText('Movies, Content & Rides')).toBeInTheDocument();
  });

  test('authenticated admin visiting /admin/login is redirected to dashboard', async () => {
    setAuth('administrator', 'Alice Admin');
    setupDefaultFetchMocks();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/admin/login', href: 'http://localhost/admin/login' },
      writable: true,
      configurable: true,
    });

    renderApp('/admin/login');

    // LoginRedirectIfAuth in App.jsx redirects to /admin/dashboard → DashboardPage
    await waitFor(() => {
      expect(screen.queryByText('Admin Control Center')).toBeNull();
      // Should see the dashboard instead
      expect(screen.getByText(/welcome,\s*alice admin/i)).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9 — Editor navigates from editor/dashboard and content renders
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: editor dashboard and content flow', () => {
  test('editor renderApp("/editor/dashboard") shows welcome message', async () => {
    setAuth('editor', 'Eddie Editor');
    setupDefaultFetchMocks();

    renderApp('/editor/dashboard');

    await waitFor(() => {
      expect(screen.getByText(/welcome,\s*eddie editor/i)).toBeInTheDocument();
    });
  });

  test('editor dashboard shows content items count from API', async () => {
    setAuth('editor', 'Eddie Editor');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/content')) return mockFetchResponse({ items: [], total: 7, pages: 1 });
      if (url.includes('/rides')) return mockFetchResponse({ rides: [], total: 0, pages: 1 });
      if (url.includes('/recommendations')) return mockFetchResponse({ movies: [] });
      return mockFetchResponse({});
    });

    renderApp('/editor/dashboard');

    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
    });
  });

  test('editor renderApp("/content") shows Content h1 heading', async () => {
    setAuth('editor', 'Eddie Editor');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/content')) return mockFetchResponse({ items: [], total: 0, pages: 1 });
      return mockFetchResponse({});
    });

    renderApp('/content');

    await waitFor(() => {
      // The ContentPage renders <h1 class="text-xl font-bold">Content</h1>
      const heading = screen.getByRole('heading', { name: /^content$/i });
      expect(heading).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10 — API 401 causes the fetch handler to clear sessionStorage
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: API 401 handling', () => {
  test('a 401 response from /api/movies clears sessionStorage token', async () => {
    setAuth('regular_user', 'Regular Ron');

    // Return 401 for the movies endpoint, empty for everything else
    mockFetch.mockImplementation((url) => {
      if (url.includes('/movies')) return mockFetchResponse({ message: 'Unauthorized' }, 401);
      return mockFetchResponse({});
    });

    // The api.js 401 handler calls sessionStorage.removeItem('cineride_token')
    // and then attempts window.location.href redirect. We render MoviesPage
    // through the full App so the real api module's 401 path runs.
    renderApp('/movies');

    // Wait for the fetch to be called
    await waitFor(() => {
      const urls = mockFetch.mock.calls.map(([u]) => u);
      expect(urls.some((u) => u.includes('/movies'))).toBe(true);
    });

    // After the 401 handler fires, the token should be cleared from sessionStorage
    await waitFor(() => {
      expect(sessionStorage.getItem('cineride_token')).toBeNull();
    });
  });

  test('a 401 response clears the sessionStorage user entry', async () => {
    setAuth('regular_user', 'Regular Ron');

    mockFetch.mockImplementation((url) => {
      if (url.includes('/movies')) return mockFetchResponse({ message: 'Session expired' }, 401);
      return mockFetchResponse({});
    });

    renderApp('/movies');

    await waitFor(() => {
      const urls = mockFetch.mock.calls.map(([u]) => u);
      expect(urls.some((u) => u.includes('/movies'))).toBe(true);
    });

    await waitFor(() => {
      expect(sessionStorage.getItem('cineride_user')).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 11 — Reviewer role sees its dashboard correctly
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: reviewer dashboard', () => {
  test('reviewer renderApp("/reviewer/dashboard") shows welcome message', async () => {
    setAuth('reviewer', 'Ray Reviewer');
    setupDefaultFetchMocks();

    renderApp('/reviewer/dashboard');

    await waitFor(() => {
      expect(screen.getByText(/welcome,\s*ray reviewer/i)).toBeInTheDocument();
    });
  });

  test('reviewer redirected from "/" to "/reviewer/dashboard"', async () => {
    setAuth('reviewer', 'Ray Reviewer');
    setupDefaultFetchMocks();

    renderApp('/');

    await waitFor(() => {
      expect(screen.getByText(/welcome,\s*ray reviewer/i)).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 12 — Catch-all route redirects authenticated user to dashboard
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: catch-all route behaviour', () => {
  test('authenticated admin visiting unknown path is redirected to dashboard', async () => {
    setAuth('administrator', 'Alice Admin');
    setupDefaultFetchMocks();

    renderApp('/this/path/does/not/exist');

    // The catch-all in App.jsx: <RoleDashboardRedirect /> sends admin to /admin/dashboard
    await waitFor(() => {
      expect(screen.getByText(/welcome,\s*alice admin/i)).toBeInTheDocument();
    });
  });

  test('unauthenticated user visiting unknown path sees login form', () => {
    // clearAuth already ran in beforeEach
    renderApp('/some/nonexistent/path');

    const usernameInput = screen.queryByPlaceholderText(/enter your username/i);
    const signInBtn    = screen.queryByRole('button', { name: /sign in/i });
    expect(usernameInput || signInBtn).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 13 — Ride queue data flows end-to-end on dispatch page
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: dispatch page live data flow', () => {
  const sampleQueue = [
    {
      _id: 'r1',
      pickup_text: 'Terminal 1',
      dropoff_text: 'City Center',
      rider_count: 3,
      vehicle_type: 'van',
      is_carpool: false,
      status: 'pending_match',
      time_window_start: '2026-04-17T08:00:00Z',
      cancellation_requested: false,
      requester: { display_name: 'Alice' },
    },
  ];

  test('dispatcher sees ride queue data rendered from fetch mock', async () => {
    setAuth('dispatcher', 'Dispatch Dave');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: sampleQueue, total: 1 });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: [], total: 0 });
      return mockFetchResponse({});
    });

    renderApp('/dispatch');

    await waitFor(() => {
      // The ride card renders "Terminal 1 → City Center"
      expect(screen.getByText(/terminal 1.*city center|terminal 1 → city center/i)).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 14 — Dashboard shows recommended movies from API response
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: dashboard movie recommendations data flow', () => {
  test('regular_user dashboard shows recommended movie titles from fetch mock', async () => {
    setAuth('regular_user', 'Regular Ron');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/recommendations')) {
        return mockFetchResponse({
          movies: [
            { _id: 'm1', title: 'Parasite', mpaa_rating: 'R' },
            { _id: 'm2', title: 'Everything Everywhere All at Once', mpaa_rating: 'R' },
          ],
        });
      }
      if (url.includes('/rides')) return mockFetchResponse({ rides: [], total: 0, pages: 1 });
      if (url.includes('/content')) return mockFetchResponse({ items: [], total: 0, pages: 1 });
      return mockFetchResponse({});
    });

    renderApp('/dashboard');

    await waitFor(() => {
      expect(screen.getByText('Parasite')).toBeInTheDocument();
      expect(screen.getByText('Everything Everywhere All at Once')).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 15 — Search page renders with full App wiring
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: search page routing', () => {
  test('any authenticated role can reach /search without being redirected to login', async () => {
    setAuth('regular_user', 'Regular Ron');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/search')) return mockFetchResponse({ movies: [], content: [], users: [], total: 0 });
      return mockFetchResponse({});
    });

    renderApp('/search');

    // The page must render — we should NOT see the login form
    await waitFor(() => {
      const usernameInput = screen.queryByPlaceholderText(/enter your username/i);
      expect(usernameInput).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 16 — Admin Config page with real data flow
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: admin config page', () => {
  test('admin renderApp("/admin/config") shows "Config Center" heading', async () => {
    setAuth('administrator', 'Admin');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/config')) return mockFetchResponse({ configs: [] });
      return mockFetchResponse({});
    });

    renderApp('/admin/config');

    await waitFor(() => {
      expect(screen.getByText('Config Center')).toBeInTheDocument();
    });
  });

  test('admin config page renders config keys from fetch response', async () => {
    setAuth('administrator', 'Admin');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/config')) {
        return mockFetchResponse({
          configs: [
            { _id: 'c1', key: 'auto_cancel_minutes', value: 30, category: 'thresholds', description: 'Auto cancel time' },
            { _id: 'c2', key: 'sensor_retention_days', value: 180, category: 'thresholds', description: 'Retention days' },
          ],
        });
      }
      return mockFetchResponse({});
    });

    renderApp('/admin/config');

    await waitFor(() => {
      expect(screen.getByText('auto_cancel_minutes')).toBeInTheDocument();
      expect(screen.getByText('sensor_retention_days')).toBeInTheDocument();
    });
  });

  test('regular_user is blocked from /admin/config', async () => {
    setAuth('regular_user', 'Regular Ron');
    setupDefaultFetchMocks();

    renderApp('/admin/config');

    await waitFor(() => {
      expect(screen.queryByText('Config Center')).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 17 — Rides page with real data flow
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: rides page data flow', () => {
  test('regular_user renderApp("/rides") shows "Ride Requests" heading', async () => {
    setAuth('regular_user', 'Ron');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) return mockFetchResponse({ rides: [], total: 0, pages: 1 });
      return mockFetchResponse({});
    });

    renderApp('/rides');

    await waitFor(() => {
      expect(screen.getByText('Ride Requests')).toBeInTheDocument();
    });
  });

  test('rides page renders ride rows from fetch response', async () => {
    setAuth('regular_user', 'Ron');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) {
        return mockFetchResponse({
          rides: [
            { _id: 'r1', pickup_text: 'Station A', dropoff_text: 'Station B', rider_count: 2, vehicle_type: 'sedan', status: 'pending_match', time_window_start: '2026-04-17T10:00:00Z', time_window_end: '2026-04-17T11:00:00Z', created_at: new Date().toISOString() },
          ],
          total: 1,
          pages: 1,
        });
      }
      return mockFetchResponse({});
    });

    renderApp('/rides');

    await waitFor(() => {
      expect(screen.getByText('Station A')).toBeInTheDocument();
      expect(screen.getByText('Station B')).toBeInTheDocument();
    });
  });

  test('rides page shows "+ New Ride" button for all authenticated users', async () => {
    setAuth('regular_user', 'Ron');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) return mockFetchResponse({ rides: [], total: 0, pages: 1 });
      return mockFetchResponse({});
    });

    renderApp('/rides');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\+ new ride/i })).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 18 — Ledger page with real data flow
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: ledger page data flow', () => {
  test('dispatcher renderApp("/ledger") shows "Funds Ledger" heading', async () => {
    setAuth('dispatcher', 'Dan');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/ledger')) return mockFetchResponse({ entries: [] });
      return mockFetchResponse({});
    });

    renderApp('/ledger');

    await waitFor(() => {
      expect(screen.getByText('Funds Ledger')).toBeInTheDocument();
    });
  });

  test('ledger page renders entries from fetch response', async () => {
    setAuth('dispatcher', 'Dan');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/ledger')) {
        return mockFetchResponse({
          entries: [
            { _id: 'le1', receipt_number: 'REC-001', amount: 25.50, payment_method: 'cash', status: 'posted', ledger_date: '2026-04-17', recorded_by: { display_name: 'Dan' }, day_closed: false },
          ],
        });
      }
      return mockFetchResponse({});
    });

    renderApp('/ledger');

    await waitFor(() => {
      expect(screen.getByText('REC-001')).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 19 — Sensors page with real data flow
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: sensors page data flow', () => {
  test('admin renderApp("/sensors") shows "Environmental Sensors" heading', async () => {
    setAuth('administrator', 'Admin');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/sensors')) return mockFetchResponse({ devices: [] });
      return mockFetchResponse({});
    });

    renderApp('/sensors');

    await waitFor(() => {
      expect(screen.getByText('Environmental Sensors')).toBeInTheDocument();
    });
  });

  test('sensors page renders device list from fetch response', async () => {
    setAuth('administrator', 'Admin');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/sensors')) {
        return mockFetchResponse({
          devices: [
            { _id: 'd1', device_id: 'TEMP-001', label: 'Lobby Temp', unit: '°C', sampling_rate_hz: 1, status: 'active' },
          ],
        });
      }
      return mockFetchResponse({});
    });

    renderApp('/sensors');

    await waitFor(() => {
      expect(screen.getByText('Lobby Temp')).toBeInTheDocument();
    });
  });

  test('editor cannot access /sensors (redirected)', async () => {
    setAuth('editor', 'Ed');
    setupDefaultFetchMocks();

    renderApp('/sensors');

    await waitFor(() => {
      expect(screen.queryByText('Environmental Sensors')).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 20 — Movie Import page via full App routing
// ─────────────────────────────────────────────────────────────────────────────
describe('Integration: movie import page', () => {
  test('editor renderApp("/movies/import") shows "Movie Import" heading', async () => {
    setAuth('editor', 'Eddie');
    setupDefaultFetchMocks();

    renderApp('/movies/import');

    await waitFor(() => {
      expect(screen.getByText('Movie Import')).toBeInTheDocument();
    });
  });

  test('regular_user is blocked from /movies/import', async () => {
    setAuth('regular_user', 'Ron');
    setupDefaultFetchMocks();

    renderApp('/movies/import');

    await waitFor(() => {
      expect(screen.queryByText('Movie Import')).toBeNull();
    });
  });
});
