import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import MoviesPage from '../features/movies/MoviesPage';

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

function setAuth(role, displayName) {
  const user = { _id: 'test-id', username: `test_${role}`, role, display_name: displayName || role };
  sessionStorage.setItem('cineride_token', 'fake-jwt-token');
  sessionStorage.setItem('cineride_user', JSON.stringify(user));
  useAuthStore.setState({ user, token: 'fake-jwt-token', mustChangePassword: false });
}

function clearAuth() {
  sessionStorage.removeItem('cineride_token');
  sessionStorage.removeItem('cineride_user');
  useAuthStore.setState({ user: null, token: null, mustChangePassword: false });
}

function renderMovies() {
  return render(
    <MemoryRouter>
      <MoviesPage />
    </MemoryRouter>
  );
}

const emptyMoviesResponse = () => {
  mockFetch.mockImplementation((url) => mockFetchResponse({ movies: [], pages: 1 }));
};

const sampleMovies = [
  { _id: 'mv1', title: 'The Matrix', mpaa_rating: 'R', is_published: true, categories: ['action'], release_date: '1999-03-31' },
  { _id: 'mv2', title: 'Inception', mpaa_rating: 'PG-13', is_published: false, categories: ['sci-fi'], release_date: '2010-07-16' },
  { _id: 'mv3', title: 'Toy Story', mpaa_rating: 'G', is_published: true, categories: ['animation'], release_date: '1995-11-22' },
];

beforeEach(() => {
  clearAuth();
  mockFetch.mockReset();
});

describe('MoviesPage — heading and layout', () => {
  test('shows Movies heading', async () => {
    setAuth('regular_user');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.getByText('Movies')).toBeInTheDocument();
  });

  test('shows Grid toggle button', async () => {
    setAuth('regular_user');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.getByRole('button', { name: /grid/i })).toBeInTheDocument();
  });

  test('shows List toggle button', async () => {
    setAuth('regular_user');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument();
  });

  test('shows search form with input and submit button', async () => {
    setAuth('regular_user');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.getByPlaceholderText(/search movies/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });
});

describe('MoviesPage — staff role controls', () => {
  test('editor sees "+ Add Movie" button', async () => {
    setAuth('editor');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.getByRole('button', { name: /\+ add movie/i })).toBeInTheDocument();
  });

  test('administrator sees "+ Add Movie" button', async () => {
    setAuth('administrator');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.getByRole('button', { name: /\+ add movie/i })).toBeInTheDocument();
  });

  test('editor sees "Import" button', async () => {
    setAuth('editor');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
  });

  test('administrator sees "Import" button', async () => {
    setAuth('administrator');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
  });
});

describe('MoviesPage — non-staff role restrictions', () => {
  test('regular_user does not see "+ Add Movie" button', async () => {
    setAuth('regular_user');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.queryByRole('button', { name: /\+ add movie/i })).toBeNull();
  });

  test('reviewer does not see "+ Add Movie" button', async () => {
    setAuth('reviewer');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.queryByRole('button', { name: /\+ add movie/i })).toBeNull();
  });

  test('dispatcher does not see "Import" button', async () => {
    setAuth('dispatcher');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.queryByRole('button', { name: /import/i })).toBeNull();
  });

  test('regular_user does not see "Import" button', async () => {
    setAuth('regular_user');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.queryByRole('button', { name: /import/i })).toBeNull();
  });
});

describe('MoviesPage — movie list rendering', () => {
  test('renders movie titles from API response', async () => {
    setAuth('regular_user');
    mockFetch.mockImplementation((url) => mockFetchResponse({ movies: sampleMovies, pages: 1 }));
    renderMovies();
    await waitFor(() => {
      expect(screen.getByText('The Matrix')).toBeInTheDocument();
      expect(screen.getByText('Inception')).toBeInTheDocument();
      expect(screen.getByText('Toy Story')).toBeInTheDocument();
    });
  });

  test('renders MPAA rating badges', async () => {
    setAuth('editor');
    mockFetch.mockImplementation((url) => mockFetchResponse({ movies: sampleMovies, pages: 1 }));
    renderMovies();
    await waitFor(() => {
      expect(screen.getAllByText('R').length).toBeGreaterThan(0);
      expect(screen.getAllByText('PG-13').length).toBeGreaterThan(0);
    });
  });

  test('calls fetch with /api/movies? query on mount', async () => {
    setAuth('regular_user');
    emptyMoviesResponse();
    renderMovies();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/movies?'),
        expect.any(Object)
      );
    });
  });

  test('renders movie list in grid view by default', async () => {
    setAuth('regular_user');
    mockFetch.mockImplementation((url) => mockFetchResponse({ movies: sampleMovies, pages: 1 }));
    const { container } = renderMovies();
    await waitFor(() => {
      expect(screen.getByText('The Matrix')).toBeInTheDocument();
    });
    // grid view uses card layout without table rows
    const tableRows = container.querySelectorAll('tbody tr');
    expect(tableRows.length).toBe(0);
  });

  test('switches to list view and shows table', async () => {
    setAuth('regular_user');
    mockFetch.mockImplementation((url) => mockFetchResponse({ movies: sampleMovies, pages: 1 }));
    const { container } = renderMovies();
    await waitFor(() => {
      expect(screen.getByText('The Matrix')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /list/i }));
    await waitFor(() => {
      const tableRows = container.querySelectorAll('tbody tr');
      expect(tableRows.length).toBeGreaterThan(0);
    });
  });
});

describe('MoviesPage — sort select', () => {
  test('renders sort select with Newest option', async () => {
    setAuth('regular_user');
    emptyMoviesResponse();
    renderMovies();
    expect(screen.getByDisplayValue('Newest')).toBeInTheDocument();
  });

  test('sort select has Popularity, Title, Rating options', async () => {
    setAuth('regular_user');
    emptyMoviesResponse();
    renderMovies();
    const select = screen.getByDisplayValue('Newest');
    expect(select.querySelector('option[value="popularity"]')).toBeTruthy();
    expect(select.querySelector('option[value="title"]')).toBeTruthy();
    expect(select.querySelector('option[value="rating"]')).toBeTruthy();
  });
});
