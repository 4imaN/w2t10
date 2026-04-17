import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import DashboardPage from '../features/dashboard/DashboardPage';

// Mock fetch at the global level so the real api.js module runs end-to-end
// (token injection, headers, error handling all exercised).
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockFetchResponse(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

function setAuth(role, display_name) {
  const user = {
    _id: 'test-id',
    username: `test_${role}`,
    role,
    display_name: display_name || `Test ${role}`,
  };
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

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

const defaultApiSuccess = () => {
  mockFetch.mockImplementation((url) => {
    if (url.includes('/rides')) return mockFetchResponse({ rides: [], total: 0 });
    if (url.includes('/content')) return mockFetchResponse({ items: [], total: 0 });
    if (url.includes('/recommendations')) return mockFetchResponse({ movies: [] });
    return mockFetchResponse({});
  });
};

beforeEach(() => {
  clearAuth();
  mockFetch.mockReset();
});

describe('DashboardPage — welcome message', () => {
  test('shows welcome with display_name for administrator', async () => {
    setAuth('administrator', 'Alice Admin');
    defaultApiSuccess();
    renderDashboard();
    expect(screen.getByText(/Welcome, Alice Admin/i)).toBeInTheDocument();
  });

  test('shows welcome with display_name for editor', async () => {
    setAuth('editor', 'Eddie Editor');
    defaultApiSuccess();
    renderDashboard();
    expect(screen.getByText(/Welcome, Eddie Editor/i)).toBeInTheDocument();
  });

  test('shows welcome with display_name for regular_user', async () => {
    setAuth('regular_user', 'Regular Ron');
    defaultApiSuccess();
    renderDashboard();
    expect(screen.getByText(/Welcome, Regular Ron/i)).toBeInTheDocument();
  });

  test('shows role in subtitle', async () => {
    setAuth('dispatcher', 'Dispatch Dan');
    defaultApiSuccess();
    renderDashboard();
    // The role subtitle uses text like "dispatcher Dashboard"
    expect(screen.getAllByText(/dispatcher/i).length).toBeGreaterThan(0);
  });
});

describe('DashboardPage — metric cards', () => {
  test('renders all four metric card labels', async () => {
    setAuth('editor', 'Ed');
    defaultApiSuccess();
    renderDashboard();
    expect(screen.getByText('Ride Requests')).toBeInTheDocument();
    expect(screen.getByText('Content Items')).toBeInTheDocument();
    expect(screen.getByText('Recommendations')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
  });

  test('shows correct total for Ride Requests after load', async () => {
    setAuth('administrator', 'Admin');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) return mockFetchResponse({ rides: [], total: 42 });
      if (url.includes('/content')) return mockFetchResponse({ items: [], total: 0 });
      if (url.includes('/recommendations')) return mockFetchResponse({ movies: [] });
      return mockFetchResponse({});
    });
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  test('shows correct total for Content Items after load', async () => {
    setAuth('editor', 'Ed');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) return mockFetchResponse({ rides: [], total: 0 });
      if (url.includes('/content')) return mockFetchResponse({ items: [], total: 17 });
      if (url.includes('/recommendations')) return mockFetchResponse({ movies: [] });
      return mockFetchResponse({});
    });
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('17')).toBeInTheDocument();
    });
  });

  test('shows recommendation count from movies array length', async () => {
    setAuth('regular_user', 'User');
    const fakeMovies = [
      { _id: 'm1', title: 'Movie One', mpaa_rating: 'PG' },
      { _id: 'm2', title: 'Movie Two', mpaa_rating: 'R' },
      { _id: 'm3', title: 'Movie Three', mpaa_rating: 'G' },
    ];
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) return mockFetchResponse({ rides: [], total: 0 });
      if (url.includes('/content')) return mockFetchResponse({ items: [], total: 0 });
      if (url.includes('/recommendations')) return mockFetchResponse({ movies: fakeMovies });
      return mockFetchResponse({});
    });
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });
});

describe('DashboardPage — loading state', () => {
  test('shows animate-pulse elements while loading', () => {
    setAuth('editor', 'Ed');
    // Never resolves — keeps loading state
    mockFetch.mockImplementation(() => new Promise(() => {}));
    const { container } = renderDashboard();
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThan(0);
  });
});

describe('DashboardPage — empty states', () => {
  test('shows "No rides yet" when rides array is empty', async () => {
    setAuth('regular_user', 'User');
    defaultApiSuccess();
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('No rides yet')).toBeInTheDocument();
    });
  });

  test('shows "No content yet" when content items array is empty', async () => {
    setAuth('regular_user', 'User');
    defaultApiSuccess();
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('No content yet')).toBeInTheDocument();
    });
  });
});

describe('DashboardPage — data rendering', () => {
  test('renders ride entries from API response', async () => {
    setAuth('administrator', 'Admin');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) return mockFetchResponse({
        rides: [
          { _id: 'r1', pickup_text: 'Station A', dropoff_text: 'Station B', status: 'pending_match' },
        ],
        total: 1,
      });
      if (url.includes('/content')) return mockFetchResponse({ items: [], total: 0 });
      if (url.includes('/recommendations')) return mockFetchResponse({ movies: [] });
      return mockFetchResponse({});
    });
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Station A')).toBeInTheDocument();
      expect(screen.getByText('Station B')).toBeInTheDocument();
    });
  });

  test('renders content entries from API response', async () => {
    setAuth('editor', 'Ed');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) return mockFetchResponse({ rides: [], total: 0 });
      if (url.includes('/content')) return mockFetchResponse({
        items: [
          { _id: 'c1', title: 'Great Article', content_type: 'article', status: 'published' },
        ],
        total: 1,
      });
      if (url.includes('/recommendations')) return mockFetchResponse({ movies: [] });
      return mockFetchResponse({});
    });
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Great Article')).toBeInTheDocument();
    });
  });

  test('renders recommended movie titles', async () => {
    setAuth('regular_user', 'User');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) return mockFetchResponse({ rides: [], total: 0 });
      if (url.includes('/content')) return mockFetchResponse({ items: [], total: 0 });
      if (url.includes('/recommendations')) return mockFetchResponse({
        movies: [
          { _id: 'mv1', title: 'Blade Runner', mpaa_rating: 'R' },
          { _id: 'mv2', title: 'Arrival', mpaa_rating: 'PG-13' },
        ],
      });
      return mockFetchResponse({});
    });
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Blade Runner')).toBeInTheDocument();
      expect(screen.getByText('Arrival')).toBeInTheDocument();
    });
  });
});

describe('DashboardPage — error states', () => {
  test('shows rides error message when rides API fails', async () => {
    setAuth('editor', 'Ed');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) return mockFetchResponse({ message: 'Rides service unavailable' }, 500);
      if (url.includes('/content')) return mockFetchResponse({ items: [], total: 0 });
      if (url.includes('/recommendations')) return mockFetchResponse({ movies: [] });
      return mockFetchResponse({});
    });
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Rides service unavailable')).toBeInTheDocument();
    });
  });

  test('shows content error message when content API fails', async () => {
    setAuth('editor', 'Ed');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) return mockFetchResponse({ rides: [], total: 0 });
      if (url.includes('/content')) return mockFetchResponse({ message: 'Content load failed' }, 500);
      if (url.includes('/recommendations')) return mockFetchResponse({ movies: [] });
      return mockFetchResponse({});
    });
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Content load failed')).toBeInTheDocument();
    });
  });

  test('shows Retry button when a section errors', async () => {
    setAuth('regular_user', 'User');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) return mockFetchResponse({ message: 'Network error' }, 500);
      if (url.includes('/content')) return mockFetchResponse({ items: [], total: 0 });
      if (url.includes('/recommendations')) return mockFetchResponse({ movies: [] });
      return mockFetchResponse({});
    });
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  test('other sections still render when one section fails', async () => {
    setAuth('editor', 'Ed');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/rides')) return mockFetchResponse({ message: 'Rides down' }, 500);
      if (url.includes('/content')) return mockFetchResponse({
        items: [{ _id: 'c1', title: 'Surviving Article', content_type: 'article', status: 'draft' }],
        total: 1,
      });
      if (url.includes('/recommendations')) return mockFetchResponse({ movies: [] });
      return mockFetchResponse({});
    });
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Surviving Article')).toBeInTheDocument();
      expect(screen.getByText('Rides down')).toBeInTheDocument();
    });
  });
});
