import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import MovieImportPage from '../features/movies/MovieImportPage';

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

function renderImportPage() {
  return render(
    <MemoryRouter>
      <MovieImportPage />
    </MemoryRouter>
  );
}

const sampleJob = {
  _id: 'job1',
  filename: 'movies_batch.csv',
  total_records: 50,
  conflict_count: 3,
  status: 'pending',
  records: [],
};

const jobWithConflicts = {
  _id: 'job2',
  filename: 'import.json',
  total_records: 10,
  conflict_count: 1,
  status: 'pending',
  records: [
    {
      imported_data: { title: 'Existing Movie' },
      status: 'conflict',
      conflicts: [
        { field: 'title', existing_value: 'Old Title', imported_value: 'New Title', resolution: null },
        { field: 'mpaa_rating', existing_value: 'PG', imported_value: 'R', resolution: null },
      ],
    },
  ],
};

const completedJob = {
  _id: 'job3',
  filename: 'done.csv',
  total_records: 20,
  conflict_count: 0,
  imported_count: 20,
  skipped_count: 0,
  status: 'completed',
  records: [],
};

beforeEach(() => {
  clearAuth();
  mockFetch.mockReset();
});

describe('MovieImportPage — heading and upload prompt', () => {
  test('renders "Movie Import" heading', () => {
    setAuth('editor');
    renderImportPage();
    expect(screen.getByText('Movie Import')).toBeInTheDocument();
  });

  test('shows upload prompt when no job is active', () => {
    setAuth('editor');
    renderImportPage();
    expect(screen.getByText('Upload a JSON or CSV file to import movies')).toBeInTheDocument();
  });

  test('file input accepts .json and .csv extensions', () => {
    setAuth('administrator');
    renderImportPage();
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput.getAttribute('accept')).toBe('.json,.csv');
  });

  test('file input is present in the DOM before upload', () => {
    setAuth('editor');
    renderImportPage();
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
  });
});

describe('MovieImportPage — after upload job details', () => {
  test('shows job details after a successful upload', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ job: sampleJob }));
    renderImportPage();

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['{}'], 'movies_batch.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/movies_batch\.csv/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/50 records/i)).toBeInTheDocument();
    expect(screen.getByText(/3 conflicts/i)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  test('shows "Execute Import" button when job status is pending', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ job: sampleJob }));
    renderImportPage();

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['{}'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /execute import/i })).toBeInTheDocument();
    });
  });

  test('does NOT show "Execute Import" button when job is completed', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ job: completedJob }));
    renderImportPage();

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['{}'], 'done.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/done\.csv/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /execute import/i })).toBeNull();
  });
});

describe('MovieImportPage — conflict resolution', () => {
  test('shows conflict resolution table for records with conflicts', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ job: jobWithConflicts }));
    renderImportPage();

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['{}'], 'import.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/existing movie/i)).toBeInTheDocument();
    });
    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('mpaa_rating')).toBeInTheDocument();
  });

  test('shows Keep and Import buttons for each conflict field', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ job: jobWithConflicts }));
    renderImportPage();

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['{}'], 'import.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const keepButtons = screen.getAllByRole('button', { name: /keep/i });
      expect(keepButtons.length).toBeGreaterThan(0);
      const importButtons = screen.getAllByRole('button', { name: /import/i });
      expect(importButtons.length).toBeGreaterThan(0);
    });
  });

  test('shows conflict table column headers: Field, Existing, Imported, Resolution', async () => {
    setAuth('editor');
    mockFetch.mockImplementation(() => mockFetchResponse({ job: jobWithConflicts }));
    renderImportPage();

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['{}'], 'import.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Field')).toBeInTheDocument();
      expect(screen.getByText('Existing')).toBeInTheDocument();
      expect(screen.getByText('Imported')).toBeInTheDocument();
      expect(screen.getByText('Resolution')).toBeInTheDocument();
    });
  });
});
