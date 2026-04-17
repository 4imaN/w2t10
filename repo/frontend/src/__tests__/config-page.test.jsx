import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import ConfigPage from '../features/admin/ConfigPage';

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

function renderConfig() {
  return render(
    <MemoryRouter>
      <ConfigPage />
    </MemoryRouter>
  );
}

const emptyConfigResponse = () => {
  mockFetch.mockImplementation((url) => mockFetchResponse({ configs: [] }));
};

const sampleConfigs = [
  {
    _id: 'c1',
    key: 'max_ride_radius_km',
    value: 50,
    category: 'thresholds',
    description: 'Maximum ride radius in kilometers',
  },
  {
    _id: 'c2',
    key: 'allowed_statuses',
    value: ['pending', 'active', 'completed'],
    category: 'statuses',
    description: 'Permitted ride statuses',
  },
  {
    _id: 'c3',
    key: 'site_name',
    value: 'Eagle Point Transport',
    category: 'general',
    description: 'Public-facing site name',
  },
];

beforeEach(() => {
  clearAuth();
  mockFetch.mockReset();
});

describe('ConfigPage — heading and controls', () => {
  test('renders "Config Center" heading', () => {
    setAuth('administrator');
    emptyConfigResponse();
    renderConfig();
    expect(screen.getByText('Config Center')).toBeInTheDocument();
  });

  test('shows "+ Add Config" button', () => {
    setAuth('administrator');
    emptyConfigResponse();
    renderConfig();
    expect(screen.getByRole('button', { name: /\+ add config/i })).toBeInTheDocument();
  });

  test('calls fetch for /api/config on mount', async () => {
    setAuth('administrator');
    emptyConfigResponse();
    renderConfig();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/config'),
        expect.any(Object)
      );
    });
  });
});

describe('ConfigPage — category filter buttons', () => {
  test('renders "All" filter button', () => {
    setAuth('administrator');
    emptyConfigResponse();
    renderConfig();
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
  });

  test('renders category filter buttons for known categories', () => {
    setAuth('administrator');
    emptyConfigResponse();
    renderConfig();
    expect(screen.getByRole('button', { name: /^statuses$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^tags$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^priority$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^thresholds$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^general$/i })).toBeInTheDocument();
  });

  test('clicking a category filter requests filtered configs', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => mockFetchResponse({ configs: [] }));
    renderConfig();

    fireEvent.click(screen.getByRole('button', { name: /^thresholds$/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/config?category=thresholds'),
        expect.any(Object)
      );
    });
  });
});

describe('ConfigPage — empty and config list states', () => {
  test('shows "No configs found" when config list is empty', async () => {
    setAuth('administrator');
    emptyConfigResponse();
    renderConfig();
    await waitFor(() => {
      expect(screen.getByText('No configs found')).toBeInTheDocument();
    });
  });

  test('renders config keys from API response', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => mockFetchResponse({ configs: sampleConfigs }));
    renderConfig();
    await waitFor(() => {
      expect(screen.getByText('max_ride_radius_km')).toBeInTheDocument();
      expect(screen.getByText('allowed_statuses')).toBeInTheDocument();
      expect(screen.getByText('site_name')).toBeInTheDocument();
    });
  });

  test('renders config values as JSON strings in table', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => mockFetchResponse({ configs: sampleConfigs }));
    renderConfig();
    await waitFor(() => {
      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText(/"Eagle Point Transport"/)).toBeInTheDocument();
    });
  });
});

describe('ConfigPage — table columns and row actions', () => {
  test('renders expected table column headers', () => {
    setAuth('administrator');
    emptyConfigResponse();
    renderConfig();
    expect(screen.getByText('Key')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  test('renders Delete button for each config row', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => mockFetchResponse({ configs: sampleConfigs }));
    renderConfig();
    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
      expect(deleteButtons.length).toBe(sampleConfigs.length);
    });
  });

  test('clicking a value opens inline edit input', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => mockFetchResponse({ configs: sampleConfigs }));
    renderConfig();
    await waitFor(() => {
      expect(screen.getByText('max_ride_radius_km')).toBeInTheDocument();
    });

    // The value cell is a span with cursor-pointer that opens inline edit
    const valueSpan = screen.getByText('50');
    fireEvent.click(valueSpan);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
    });
  });
});
