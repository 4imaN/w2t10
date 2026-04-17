import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import ContentPage from '../features/content/ContentPage';

// Mock fetch at the global level so the real api.js module runs end-to-end
// (token injection, headers, error handling all exercised).
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockFetchResponse(data, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(data) });
}

function setAuth(role) {
  const user = { _id: 'u1', username: `test_${role}`, role, display_name: `Test ${role}` };
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

function renderContent() {
  return render(
    <MemoryRouter>
      <ContentPage />
    </MemoryRouter>
  );
}

const emptyContentResponse = () => {
  mockFetch.mockImplementation(() => mockFetchResponse({ items: [], pages: 1 }));
};

const sampleItems = [
  { _id: 'c1', title: 'Breaking News', content_type: 'article', status: 'draft', author: { display_name: 'Alice' }, updated_at: '2026-01-01T00:00:00Z' },
  { _id: 'c2', title: 'Photo Gallery', content_type: 'gallery', status: 'in_review_1', author: { display_name: 'Bob' }, updated_at: '2026-01-02T00:00:00Z' },
  { _id: 'c3', title: 'Film Event', content_type: 'event', status: 'published', author: { display_name: 'Carol' }, updated_at: '2026-01-03T00:00:00Z' },
];

beforeEach(() => {
  clearAuth();
  mockFetch.mockReset();
});

describe('ContentPage — heading', () => {
  test('shows Content heading', async () => {
    setAuth('editor');
    emptyContentResponse();
    renderContent();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  test('calls api.get with /content? on mount', async () => {
    setAuth('editor');
    emptyContentResponse();
    renderContent();
    await waitFor(() => {
      const urls = mockFetch.mock.calls.map(([u]) => u);
      expect(urls.some(u => u.includes('/content?'))).toBe(true);
    });
  });
});

describe('ContentPage — staff Create button', () => {
  test('editor sees "+ Create Content" button', async () => {
    setAuth('editor');
    emptyContentResponse();
    renderContent();
    expect(screen.getByRole('button', { name: /\+ create content/i })).toBeInTheDocument();
  });

  test('administrator sees "+ Create Content" button', async () => {
    setAuth('administrator');
    emptyContentResponse();
    renderContent();
    expect(screen.getByRole('button', { name: /\+ create content/i })).toBeInTheDocument();
  });

  test('regular_user does not see "+ Create Content" button', async () => {
    setAuth('regular_user');
    emptyContentResponse();
    renderContent();
    expect(screen.queryByRole('button', { name: /\+ create content/i })).toBeNull();
  });

  test('dispatcher does not see "+ Create Content" button', async () => {
    setAuth('dispatcher');
    emptyContentResponse();
    renderContent();
    expect(screen.queryByRole('button', { name: /\+ create content/i })).toBeNull();
  });
});

describe('ContentPage — editorial status filter buttons', () => {
  const editorialRoles = ['administrator', 'editor', 'reviewer'];

  for (const role of editorialRoles) {
    test(`${role} sees status filter buttons`, async () => {
      setAuth(role);
      emptyContentResponse();
      renderContent();
      // "All" is the filter for empty statusFilter
      expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^draft$/i })).toBeInTheDocument();
    });
  }

  test('regular_user does not see status filter buttons', async () => {
    setAuth('regular_user');
    emptyContentResponse();
    renderContent();
    // No status filters should exist for non-editorial roles
    expect(screen.queryByRole('button', { name: /^draft$/i })).toBeNull();
  });

  test('dispatcher does not see status filter buttons', async () => {
    setAuth('dispatcher');
    emptyContentResponse();
    renderContent();
    expect(screen.queryByRole('button', { name: /^draft$/i })).toBeNull();
  });
});

describe('ContentPage — loading state', () => {
  test('shows Loading content... while API is pending', () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => new Promise(() => {}));
    renderContent();
    expect(screen.getByText(/loading content/i)).toBeInTheDocument();
  });
});

describe('ContentPage — table rendering', () => {
  test('renders content item titles in table', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ items: sampleItems, pages: 1 }));
    renderContent();
    await waitFor(() => {
      expect(screen.getByText('Breaking News')).toBeInTheDocument();
      expect(screen.getByText('Photo Gallery')).toBeInTheDocument();
      expect(screen.getByText('Film Event')).toBeInTheDocument();
    });
  });

  test('renders content types in table', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ items: sampleItems, pages: 1 }));
    renderContent();
    await waitFor(() => {
      expect(screen.getByText('article')).toBeInTheDocument();
      expect(screen.getByText('gallery')).toBeInTheDocument();
      expect(screen.getByText('event')).toBeInTheDocument();
    });
  });

  test('renders author names in table', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ items: sampleItems, pages: 1 }));
    renderContent();
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  test('table has expected column headers', async () => {
    setAuth('editor');
    emptyContentResponse();
    renderContent();
    await waitFor(() => {
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Author')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });
});

describe('ContentPage — error state', () => {
  test('shows error message when content API fails', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ message: 'Content service down' }, 500));
    renderContent();
    await waitFor(() => {
      expect(screen.getByText('Content service down')).toBeInTheDocument();
    });
  });

  test('shows Retry button on error', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ message: 'Network error' }, 500));
    renderContent();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  test('clicking Retry calls api.get again', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ message: 'Fail' }, 500));
    renderContent();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
    mockFetch.mockImplementation(() => mockFetchResponse({ items: [], pages: 1 }));
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  test('error state hides the table', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ message: 'Fail' }, 500));
    const { container } = renderContent();
    await waitFor(() => {
      expect(screen.getByText(/fail/i)).toBeInTheDocument();
    });
    const table = container.querySelector('table');
    expect(table).toBeNull();
  });
});
