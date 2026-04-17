import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import DispatchPage from '../features/dispatch/DispatchPage';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockFetchResponse(data, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(data) });
}

function setAuth(role) {
  const user = { _id: 'u1', username: `test_${role}`, role, display_name: `Test ${role}` };
  sessionStorage.setItem('cineride_token', 'fake-jwt-token');
  sessionStorage.setItem('cineride_user', JSON.stringify(user));
  useAuthStore.setState({ user, token: 'fake-jwt-token', mustChangePassword: false });
}

function clearAuth() {
  sessionStorage.removeItem('cineride_token');
  sessionStorage.removeItem('cineride_user');
  useAuthStore.setState({ user: null, token: null, mustChangePassword: false });
}

function renderDispatch() {
  return render(
    <MemoryRouter>
      <DispatchPage />
    </MemoryRouter>
  );
}

const emptyDispatchResponse = () => {
  mockFetch.mockImplementation((url) => {
    if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: [] });
    if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: [] });
    return mockFetchResponse({});
  });
};

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
  {
    _id: 'r2',
    pickup_text: 'Main Station',
    dropoff_text: 'University',
    rider_count: 1,
    vehicle_type: 'sedan',
    is_carpool: true,
    status: 'accepted',
    time_window_start: '2026-04-17T09:00:00Z',
    cancellation_requested: false,
    requester: { display_name: 'Bob' },
  },
];

const sampleDisputes = [
  {
    _id: 'd1',
    ride_request: { pickup_text: 'Harbor', dropoff_text: 'Mall' },
    reason: 'no_show',
    detail: 'Driver never arrived',
    status: 'open',
    initiated_by: { display_name: 'Carol' },
  },
  {
    _id: 'd2',
    ride_request: { pickup_text: 'Park', dropoff_text: 'Office' },
    reason: 'wrong_route',
    detail: 'Took the long way',
    status: 'investigating',
    initiated_by: { display_name: 'Dan' },
  },
];

beforeEach(() => {
  clearAuth();
  mockFetch.mockReset();
});

describe('DispatchPage — heading', () => {
  test('shows Dispatch Center heading', async () => {
    setAuth('dispatcher');
    emptyDispatchResponse();
    renderDispatch();
    expect(screen.getByText('Dispatch Center')).toBeInTheDocument();
  });

  test('calls api.get for queue and disputes on mount', async () => {
    setAuth('dispatcher');
    emptyDispatchResponse();
    renderDispatch();
    await waitFor(() => {
      const urls = mockFetch.mock.calls.map(([u]) => u);
      expect(urls.some(u => u.includes('/dispatch/queue'))).toBe(true);
      expect(urls.some(u => u.includes('/dispatch/disputes'))).toBe(true);
    });
  });
});

describe('DispatchPage — tab buttons', () => {
  test('shows "Ride Queue" tab button', async () => {
    setAuth('dispatcher');
    emptyDispatchResponse();
    renderDispatch();
    expect(screen.getByRole('button', { name: /ride queue/i })).toBeInTheDocument();
  });

  test('shows "Disputes" tab button', async () => {
    setAuth('dispatcher');
    emptyDispatchResponse();
    renderDispatch();
    expect(screen.getByRole('button', { name: /disputes/i })).toBeInTheDocument();
  });

  test('tab buttons show counts', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: sampleQueue });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: sampleDisputes });
      return mockFetchResponse({});
    });
    renderDispatch();
    await waitFor(() => {
      // Queue tab shows count of 2
      expect(screen.getByRole('button', { name: /ride queue \(2\)/i })).toBeInTheDocument();
      // Disputes tab shows count of 2
      expect(screen.getByRole('button', { name: /disputes \(2\)/i })).toBeInTheDocument();
    });
  });
});

describe('DispatchPage — empty states', () => {
  test('shows "No pending rides" when queue is empty', async () => {
    setAuth('dispatcher');
    emptyDispatchResponse();
    renderDispatch();
    await waitFor(() => {
      expect(screen.getByText(/no pending rides/i)).toBeInTheDocument();
    });
  });

  test('shows "No open disputes" when disputes tab is active and empty', async () => {
    setAuth('dispatcher');
    emptyDispatchResponse();
    renderDispatch();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disputes/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /disputes/i }));
    await waitFor(() => {
      expect(screen.getByText(/no open disputes/i)).toBeInTheDocument();
    });
  });
});

describe('DispatchPage — queue rendering', () => {
  test('renders ride cards in queue', async () => {
    setAuth('dispatcher');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: sampleQueue });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: [] });
      return mockFetchResponse({});
    });
    renderDispatch();
    await waitFor(() => {
      expect(screen.getByText(/terminal 1.*city center|terminal 1 → city center/i)).toBeInTheDocument();
    });
  });

  test('renders second ride in queue', async () => {
    setAuth('dispatcher');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: sampleQueue });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: [] });
      return mockFetchResponse({});
    });
    renderDispatch();
    await waitFor(() => {
      expect(screen.getByText(/main station.*university|main station → university/i)).toBeInTheDocument();
    });
  });

  test('renders Pending Rides section label', async () => {
    setAuth('dispatcher');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: sampleQueue });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: [] });
      return mockFetchResponse({});
    });
    renderDispatch();
    await waitFor(() => {
      expect(screen.getByText('Pending Rides')).toBeInTheDocument();
    });
  });
});

describe('DispatchPage — disputes tab', () => {
  test('switching to Disputes tab shows dispute entries', async () => {
    setAuth('dispatcher');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: [] });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: sampleDisputes });
      return mockFetchResponse({});
    });
    renderDispatch();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disputes/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /disputes/i }));
    await waitFor(() => {
      expect(screen.getByText(/harbor.*mall|harbor → mall/i)).toBeInTheDocument();
    });
  });

  test('disputes tab shows reason text', async () => {
    setAuth('dispatcher');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: [] });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: sampleDisputes });
      return mockFetchResponse({});
    });
    renderDispatch();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disputes/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /disputes/i }));
    await waitFor(() => {
      expect(screen.getByText(/no show/i)).toBeInTheDocument();
    });
  });

  test('disputes tab shows Resolve button for open disputes', async () => {
    setAuth('dispatcher');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: [] });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: sampleDisputes });
      return mockFetchResponse({});
    });
    renderDispatch();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disputes/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /disputes/i }));
    await waitFor(() => {
      const resolveBtns = screen.getAllByRole('button', { name: /resolve/i });
      expect(resolveBtns.length).toBeGreaterThan(0);
    });
  });

  test('disputes tab shows Assign to Me button for open disputes', async () => {
    setAuth('dispatcher');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: [] });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: [sampleDisputes[0]] });
      return mockFetchResponse({});
    });
    renderDispatch();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /disputes/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /disputes/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /assign to me/i })).toBeInTheDocument();
    });
  });
});

describe('DispatchPage — ride detail panel', () => {
  test('clicking a ride in queue shows detail panel', async () => {
    setAuth('dispatcher');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/dispatch/queue')) return mockFetchResponse({ rides: sampleQueue });
      if (url.includes('/dispatch/disputes')) return mockFetchResponse({ disputes: [] });
      return mockFetchResponse({});
    });
    renderDispatch();
    await waitFor(() => {
      expect(screen.getByText(/terminal 1/i)).toBeInTheDocument();
    });
    // click on the first ride card
    fireEvent.click(screen.getByText(/terminal 1 → city center/i));
    await waitFor(() => {
      expect(screen.getByText('Ride Details')).toBeInTheDocument();
    });
  });
});
