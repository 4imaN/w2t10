import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import RidesPage from '../features/rides/RidesPage';

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

function renderRides() {
  return render(
    <MemoryRouter>
      <RidesPage />
    </MemoryRouter>
  );
}

const emptyRidesResponse = () => {
  mockFetch.mockImplementation(() => mockFetchResponse({ rides: [], pages: 1 }));
};

// Rides with created_at far in the past (free cancel window expired)
const sampleRides = [
  {
    _id: 'r1',
    pickup_text: 'Airport',
    dropoff_text: 'Hotel',
    rider_count: 2,
    vehicle_type: 'sedan',
    is_carpool: false,
    status: 'pending_match',
    time_window_start: '2026-04-17T10:00:00Z',
    time_window_end: '2026-04-17T11:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    _id: 'r2',
    pickup_text: 'Downtown',
    dropoff_text: 'Stadium',
    rider_count: 1,
    vehicle_type: 'suv',
    is_carpool: true,
    status: 'completed',
    time_window_start: '2026-04-17T14:00:00Z',
    time_window_end: '2026-04-17T15:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
  },
];

beforeEach(() => {
  clearAuth();
  mockFetch.mockReset();
});

describe('RidesPage — heading and primary button', () => {
  test('shows Ride Requests heading', async () => {
    setAuth('regular_user');
    emptyRidesResponse();
    renderRides();
    expect(screen.getByText('Ride Requests')).toBeInTheDocument();
  });

  test('shows "+ New Ride" button for regular_user', async () => {
    setAuth('regular_user');
    emptyRidesResponse();
    renderRides();
    expect(screen.getByRole('button', { name: /\+ new ride/i })).toBeInTheDocument();
  });

  test('shows "+ New Ride" button for administrator', async () => {
    setAuth('administrator');
    emptyRidesResponse();
    renderRides();
    expect(screen.getByRole('button', { name: /\+ new ride/i })).toBeInTheDocument();
  });

  test('shows "+ New Ride" button for dispatcher', async () => {
    setAuth('dispatcher');
    emptyRidesResponse();
    renderRides();
    expect(screen.getByRole('button', { name: /\+ new ride/i })).toBeInTheDocument();
  });

  test('calls api.get with /rides? on mount', async () => {
    setAuth('regular_user');
    emptyRidesResponse();
    renderRides();
    await waitFor(() => {
      const urls = mockFetch.mock.calls.map(([u]) => u);
      expect(urls.some(u => u.includes('/rides?'))).toBe(true);
    });
  });
});

describe('RidesPage — status filter buttons', () => {
  test('shows All filter button', async () => {
    setAuth('regular_user');
    emptyRidesResponse();
    renderRides();
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
  });

  test('shows Pending Match filter button', async () => {
    setAuth('regular_user');
    emptyRidesResponse();
    renderRides();
    expect(screen.getByRole('button', { name: /pending match/i })).toBeInTheDocument();
  });

  test('shows Completed filter button', async () => {
    setAuth('regular_user');
    emptyRidesResponse();
    renderRides();
    expect(screen.getByRole('button', { name: /completed/i })).toBeInTheDocument();
  });

  test('shows Canceled filter button', async () => {
    setAuth('regular_user');
    emptyRidesResponse();
    renderRides();
    expect(screen.getByRole('button', { name: /canceled/i })).toBeInTheDocument();
  });
});

describe('RidesPage — loading state', () => {
  test('shows Loading rides... while API is pending', () => {
    setAuth('regular_user');
    mockFetch.mockImplementation(() => new Promise(() => {}));
    renderRides();
    expect(screen.getByText(/loading rides/i)).toBeInTheDocument();
  });
});

describe('RidesPage — table rendering', () => {
  test('renders ride routes in table', async () => {
    setAuth('regular_user');
    mockFetch.mockImplementation(() => mockFetchResponse({ rides: sampleRides, pages: 1 }));
    renderRides();
    await waitFor(() => {
      expect(screen.getByText('Airport')).toBeInTheDocument();
      expect(screen.getByText('Hotel')).toBeInTheDocument();
      expect(screen.getByText('Downtown')).toBeInTheDocument();
      expect(screen.getByText('Stadium')).toBeInTheDocument();
    });
  });

  test('renders rider counts', async () => {
    setAuth('regular_user');
    mockFetch.mockImplementation(() => mockFetchResponse({ rides: sampleRides, pages: 1 }));
    renderRides();
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  test('table has expected column headers', async () => {
    setAuth('regular_user');
    emptyRidesResponse();
    renderRides();
    await waitFor(() => {
      expect(screen.getByText('Route')).toBeInTheDocument();
      expect(screen.getByText('Riders')).toBeInTheDocument();
      expect(screen.getByText('Vehicle')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  test('shows View action button for each ride', async () => {
    setAuth('regular_user');
    mockFetch.mockImplementation(() => mockFetchResponse({ rides: sampleRides, pages: 1 }));
    renderRides();
    await waitFor(() => {
      const viewBtns = screen.getAllByRole('button', { name: /^view$/i });
      expect(viewBtns.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('RidesPage — error state', () => {
  test('shows error message when rides API fails', async () => {
    setAuth('regular_user');
    mockFetch.mockImplementation(() => mockFetchResponse({ message: 'Rides service unavailable' }, 500));
    renderRides();
    await waitFor(() => {
      expect(screen.getByText('Rides service unavailable')).toBeInTheDocument();
    });
  });

  test('shows Retry button on error', async () => {
    setAuth('regular_user');
    mockFetch.mockImplementation(() => mockFetchResponse({ message: 'Network error' }, 500));
    renderRides();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  test('clicking Retry triggers another api.get call', async () => {
    setAuth('regular_user');
    mockFetch.mockImplementation(() => mockFetchResponse({ message: 'Fail' }, 500));
    renderRides();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
    mockFetch.mockImplementation(() => mockFetchResponse({ rides: [], pages: 1 }));
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  test('error state hides the table', async () => {
    setAuth('regular_user');
    mockFetch.mockImplementation(() => mockFetchResponse({ message: 'Fail' }, 500));
    const { container } = renderRides();
    await waitFor(() => {
      expect(screen.getByText(/fail/i)).toBeInTheDocument();
    });
    const table = container.querySelector('table');
    expect(table).toBeNull();
  });
});

describe('RidesPage — New Ride modal', () => {
  test('clicking New Ride opens the modal with form fields', async () => {
    setAuth('regular_user');
    emptyRidesResponse();
    renderRides();
    fireEvent.click(screen.getByRole('button', { name: /\+ new ride/i }));
    await waitFor(() => {
      expect(screen.getByText('New Ride Request')).toBeInTheDocument();
      expect(screen.getByText(/pickup location/i)).toBeInTheDocument();
      expect(screen.getByText(/drop-off location/i)).toBeInTheDocument();
    });
  });
});
