import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import LedgerPage from '../features/ledger/LedgerPage';

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

function renderLedger() {
  return render(
    <MemoryRouter>
      <LedgerPage />
    </MemoryRouter>
  );
}

const emptyLedgerResponse = () => {
  mockFetch.mockImplementation((url) => {
    if (url.includes('/ledger/entries')) return mockFetchResponse({ entries: [] });
    if (url.includes('/ledger/reconciliation')) return mockFetchResponse({ reconciliation: null });
    return mockFetchResponse({});
  });
};

const sampleEntries = [
  {
    _id: 'e1',
    receipt_number: 'RCP-001',
    amount: 45.00,
    payment_method: 'cash',
    status: 'confirmed',
    ledger_date: '2026-04-17',
    recorded_by: { display_name: 'Alice Admin' },
    day_closed: false,
  },
  {
    _id: 'e2',
    receipt_number: 'RCP-002',
    amount: 120.50,
    payment_method: 'card_on_file',
    status: 'confirmed',
    ledger_date: '2026-04-17',
    recorded_by: { display_name: 'Bob Dispatcher' },
    day_closed: true,
  },
];

const sampleReconciliation = {
  ledger_date: '2026-04-17',
  total_amount: 165.50,
  total_cash: 45.00,
  total_card: 120.50,
  entry_count: 2,
  locked: false,
  closed_by: null,
};

beforeEach(() => {
  clearAuth();
  mockFetch.mockReset();
});

describe('LedgerPage — heading and primary controls', () => {
  test('renders "Funds Ledger" heading', () => {
    setAuth('administrator');
    emptyLedgerResponse();
    renderLedger();
    expect(screen.getByText('Funds Ledger')).toBeInTheDocument();
  });

  test('shows "+ Record Payment" button', () => {
    setAuth('administrator');
    emptyLedgerResponse();
    renderLedger();
    expect(screen.getByRole('button', { name: /\+ record payment/i })).toBeInTheDocument();
  });

  test('calls api.get for /ledger/entries on mount', async () => {
    setAuth('administrator');
    emptyLedgerResponse();
    renderLedger();
    await waitFor(() => {
      const urls = mockFetch.mock.calls.map(([u]) => u);
      expect(urls.some(u => u.includes('/ledger/entries'))).toBe(true);
    });
  });
});

describe('LedgerPage — tab buttons', () => {
  test('shows "Entries" tab button', () => {
    setAuth('administrator');
    emptyLedgerResponse();
    renderLedger();
    expect(screen.getByRole('button', { name: /^entries$/i })).toBeInTheDocument();
  });

  test('shows "Reconciliation" tab button', () => {
    setAuth('administrator');
    emptyLedgerResponse();
    renderLedger();
    expect(screen.getByRole('button', { name: /reconciliation/i })).toBeInTheDocument();
  });
});

describe('LedgerPage — entries table', () => {
  test('shows "No entries" when entries list is empty', async () => {
    setAuth('administrator');
    emptyLedgerResponse();
    renderLedger();
    await waitFor(() => {
      expect(screen.getByText('No entries')).toBeInTheDocument();
    });
  });

  test('renders receipt numbers from API response', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/ledger/entries')) return mockFetchResponse({ entries: sampleEntries });
      return mockFetchResponse({ reconciliation: null });
    });
    renderLedger();
    await waitFor(() => {
      expect(screen.getByText('RCP-001')).toBeInTheDocument();
      expect(screen.getByText('RCP-002')).toBeInTheDocument();
    });
  });

  test('entries table has expected column headers', async () => {
    setAuth('administrator');
    emptyLedgerResponse();
    renderLedger();
    expect(screen.getByText('Receipt #')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Method')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Recorded By')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  test('renders recorded_by display names in table rows', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/ledger/entries')) return mockFetchResponse({ entries: sampleEntries });
      return mockFetchResponse({ reconciliation: null });
    });
    renderLedger();
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
      expect(screen.getByText('Bob Dispatcher')).toBeInTheDocument();
    });
  });
});

describe('LedgerPage — reconciliation tab', () => {
  test('switching to Reconciliation tab shows a date input', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/ledger/entries')) return mockFetchResponse({ entries: [] });
      if (url.includes('/ledger/reconciliation')) return mockFetchResponse({ reconciliation: sampleReconciliation });
      return mockFetchResponse({});
    });
    renderLedger();

    fireEvent.click(screen.getByRole('button', { name: /reconciliation/i }));

    await waitFor(() => {
      const dateInput = document.querySelector('input[type="date"]');
      expect(dateInput).not.toBeNull();
    });
  });

  test('reconciliation totals display after loading data', async () => {
    setAuth('administrator');
    mockFetch.mockImplementation((url) => {
      if (url.includes('/ledger/entries')) return mockFetchResponse({ entries: [] });
      if (url.includes('/ledger/reconciliation')) return mockFetchResponse({ reconciliation: sampleReconciliation });
      return mockFetchResponse({});
    });
    renderLedger();

    fireEvent.click(screen.getByRole('button', { name: /reconciliation/i }));

    // Wait for reconciliation card to render; verify label text nodes
    await waitFor(() => {
      expect(screen.getByText('Card on File')).toBeInTheDocument();
    });
    expect(screen.getByText('Cash')).toBeInTheDocument();
    // "Entries" label appears multiple times (tab + reconciliation label); check at least one exists
    expect(screen.getAllByText('Entries').length).toBeGreaterThan(0);
  });
});
