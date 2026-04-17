import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import SensorsPage from '../features/sensors/SensorsPage';

// Mock fetch at the global level so the real api.js module runs end-to-end
// (token injection, headers, error handling all exercised).
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockFetchResponse(data, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(data) });
}

function setAuth(role, displayName) {
  const user = { _id: 'test-id', username: `test_${role}`, role, display_name: displayName || role };
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

function renderSensors() {
  return render(
    <MemoryRouter>
      <SensorsPage />
    </MemoryRouter>
  );
}

const emptyDevicesResponse = () => {
  mockFetch.mockImplementation(() => mockFetchResponse({ devices: [] }));
};

const sampleDevices = [
  {
    _id: 'd1',
    device_id: 'SENSOR-001',
    label: 'Lobby Thermometer',
    unit: '°C',
    sampling_rate_hz: 1,
    status: 'active',
    range_min: -10,
    range_max: 60,
    spike_threshold: 5,
    drift_threshold: 2,
  },
  {
    _id: 'd2',
    device_id: 'SENSOR-002',
    label: 'Roof Humidity',
    unit: '%',
    sampling_rate_hz: 0.5,
    status: 'inactive',
    range_min: 0,
    range_max: 100,
    spike_threshold: 10,
    drift_threshold: 3,
  },
];

const sampleReadings = [
  {
    timestamp: '2026-04-17T10:00:00Z',
    value: 22.5,
    unit: '°C',
    is_cleaned: true,
    outlier_flags: { range: false, spike: false, drift: false },
    time_drift_seconds: 0.1,
  },
  {
    timestamp: '2026-04-17T10:01:00Z',
    value: 85.0,
    unit: '°C',
    is_cleaned: false,
    outlier_flags: { range: true, spike: true, drift: false },
    time_drift_seconds: 0.3,
  },
];

beforeEach(() => {
  clearAuth();
  mockFetch.mockReset();
});

describe('SensorsPage — heading and layout', () => {
  test('renders "Environmental Sensors" heading', () => {
    setAuth('administrator');
    emptyDevicesResponse();
    renderSensors();
    expect(screen.getByText('Environmental Sensors')).toBeInTheDocument();
  });

  test('shows "Select a device to view readings" by default', async () => {
    setAuth('administrator');
    emptyDevicesResponse();
    renderSensors();
    expect(screen.getByText('Select a device to view readings')).toBeInTheDocument();
  });

  test('calls api.get for /sensors/devices on mount', async () => {
    setAuth('administrator');
    emptyDevicesResponse();
    renderSensors();
    await waitFor(() => {
      const urls = mockFetch.mock.calls.map(([u]) => u);
      expect(urls.some(u => u.includes('/sensors/devices'))).toBe(true);
    });
  });
});

describe('SensorsPage — role-based controls', () => {
  test('administrator sees "+ Add Device" button', () => {
    setAuth('administrator');
    emptyDevicesResponse();
    renderSensors();
    expect(screen.getByRole('button', { name: /\+ add device/i })).toBeInTheDocument();
  });

  test('dispatcher does NOT see "+ Add Device" button', () => {
    setAuth('dispatcher');
    emptyDevicesResponse();
    renderSensors();
    expect(screen.queryByRole('button', { name: /\+ add device/i })).toBeNull();
  });

  test('regular_user does NOT see "+ Add Device" button', () => {
    setAuth('regular_user');
    emptyDevicesResponse();
    renderSensors();
    expect(screen.queryByRole('button', { name: /\+ add device/i })).toBeNull();
  });
});

describe('SensorsPage — empty and device list states', () => {
  test('shows "No devices registered" when device list is empty', async () => {
    setAuth('administrator');
    emptyDevicesResponse();
    renderSensors();
    await waitFor(() => {
      expect(screen.getByText('No devices registered')).toBeInTheDocument();
    });
  });

  test('renders device labels from API response', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation(() => mockFetchResponse({ devices: sampleDevices }));
    renderSensors();
    await waitFor(() => {
      expect(screen.getByText('Lobby Thermometer')).toBeInTheDocument();
      expect(screen.getByText('Roof Humidity')).toBeInTheDocument();
    });
  });

  test('renders device_id and unit for each device', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation(() => mockFetchResponse({ devices: sampleDevices }));
    renderSensors();
    await waitFor(() => {
      expect(screen.getByText(/SENSOR-001/)).toBeInTheDocument();
      expect(screen.getByText(/SENSOR-002/)).toBeInTheDocument();
    });
  });
});

describe('SensorsPage — readings table', () => {
  test('clicking a device loads readings and shows table columns', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/sensors/devices')) return mockFetchResponse({ devices: sampleDevices });
      if (url.includes('/sensors/readings/')) return mockFetchResponse({ readings: sampleReadings });
      return mockFetchResponse({});
    });
    renderSensors();

    await waitFor(() => {
      expect(screen.getByText('Lobby Thermometer')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Lobby Thermometer'));

    await waitFor(() => {
      expect(screen.getByText('Timestamp')).toBeInTheDocument();
      expect(screen.getByText('Value')).toBeInTheDocument();
      expect(screen.getByText('Unit')).toBeInTheDocument();
      expect(screen.getByText('Cleaned')).toBeInTheDocument();
      expect(screen.getByText('Outlier Flags')).toBeInTheDocument();
    });
  });

  test('readings table shows Drift column header', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/sensors/devices')) return mockFetchResponse({ devices: sampleDevices });
      if (url.includes('/sensors/readings/')) return mockFetchResponse({ readings: sampleReadings });
      return mockFetchResponse({});
    });
    renderSensors();

    await waitFor(() => {
      expect(screen.getByText('Lobby Thermometer')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Lobby Thermometer'));

    await waitFor(() => {
      // The column header is "Drift (s)" in the source
      expect(screen.getByText('Drift (s)')).toBeInTheDocument();
    });
  });
});
