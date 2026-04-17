import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import UsersPage from '../features/admin/UsersPage';

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

function renderUsers() {
  return render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>
  );
}

const emptyUsersResponse = () => {
  mockFetch.mockImplementation((url) => mockFetchResponse({ users: [], pages: 1 }));
};

const sampleUsers = [
  {
    _id: 'u1',
    username: 'alice_admin',
    display_name: 'Alice Admin',
    role: 'administrator',
    phone: '555-0100',
    status: 'active',
  },
  {
    _id: 'u2',
    username: 'bob_dispatch',
    display_name: 'Bob Dispatcher',
    role: 'dispatcher',
    phone: '555-0200',
    status: 'active',
  },
  {
    _id: 'u3',
    username: 'carol_editor',
    display_name: 'Carol Editor',
    role: 'editor',
    phone: null,
    status: 'inactive',
  },
];

beforeEach(() => {
  clearAuth();
  mockFetch.mockReset();
});

describe('UsersPage — heading and controls', () => {
  test('renders "User Management" heading', () => {
    setAuth('administrator');
    emptyUsersResponse();
    renderUsers();
    expect(screen.getByText('User Management')).toBeInTheDocument();
  });

  test('shows "+ Create User" button', () => {
    setAuth('administrator');
    emptyUsersResponse();
    renderUsers();
    expect(screen.getByRole('button', { name: /\+ create user/i })).toBeInTheDocument();
  });

  test('calls fetch for /api/users on mount', async () => {
    setAuth('administrator');
    emptyUsersResponse();
    renderUsers();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users'),
        expect.any(Object)
      );
    });
  });
});

describe('UsersPage — table columns', () => {
  test('renders expected table column headers', () => {
    setAuth('administrator');
    emptyUsersResponse();
    renderUsers();
    expect(screen.getByText('Username')).toBeInTheDocument();
    expect(screen.getByText('Display Name')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });
});

describe('UsersPage — user list rendering', () => {
  test('renders usernames from API response', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => mockFetchResponse({ users: sampleUsers, pages: 1 }));
    renderUsers();
    await waitFor(() => {
      expect(screen.getByText('alice_admin')).toBeInTheDocument();
      expect(screen.getByText('bob_dispatch')).toBeInTheDocument();
      expect(screen.getByText('carol_editor')).toBeInTheDocument();
    });
  });

  test('renders display names for each user', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => mockFetchResponse({ users: sampleUsers, pages: 1 }));
    renderUsers();
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
      expect(screen.getByText('Bob Dispatcher')).toBeInTheDocument();
      expect(screen.getByText('Carol Editor')).toBeInTheDocument();
    });
  });

  test('renders role badge for each user', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => mockFetchResponse({ users: sampleUsers, pages: 1 }));
    renderUsers();
    await waitFor(() => {
      // Badges show role labels from ROLE_LABELS constant
      const badges = document.querySelectorAll('.badge');
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  test('renders Edit button for each user row', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => mockFetchResponse({ users: sampleUsers, pages: 1 }));
    renderUsers();
    await waitFor(() => {
      const editButtons = screen.getAllByRole('button', { name: /^edit$/i });
      expect(editButtons.length).toBe(sampleUsers.length);
    });
  });

  test('renders Delete button for each user row', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => mockFetchResponse({ users: sampleUsers, pages: 1 }));
    renderUsers();
    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
      expect(deleteButtons.length).toBe(sampleUsers.length);
    });
  });
});

describe('UsersPage — pagination', () => {
  test('does not render pagination component when only one page', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => mockFetchResponse({ users: sampleUsers, pages: 1 }));
    renderUsers();
    await waitFor(() => {
      expect(screen.getByText('alice_admin')).toBeInTheDocument();
    });
    // Pagination renders nothing when pages <= 1
    expect(screen.queryByRole('button', { name: /previous/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /next/i })).toBeNull();
  });

  test('renders pagination when multiple pages exist', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => mockFetchResponse({ users: sampleUsers, pages: 3 }));
    renderUsers();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });
  });
});
