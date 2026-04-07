import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../store/authStore', () => ({
  default: Object.assign(
    (selector) => {
      const state = {
        user: { role: 'administrator' }, token: 'fake',
        login: vi.fn(), logout: vi.fn(),
        isAuthenticated: () => true, hasRole: () => true,
      };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ user: { role: 'administrator' }, token: 'fake' }), subscribe: vi.fn(), setState: vi.fn() }
  ),
}));

const mockGet = vi.fn();
vi.mock('../services/api', () => ({
  default: {
    get: (...args) => mockGet(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
}));

import SearchPage from '../features/search/SearchPage';

function renderSearch() {
  return render(
    <MemoryRouter initialEntries={['/search']}>
      <SearchPage />
    </MemoryRouter>
  );
}

function getSearchInput() {
  return screen.getByPlaceholderText('Search movies, content, users...');
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ movies: [], content: [], users: [], total: 0, suggestions: [] });
});

describe('Search Suggestions UI', () => {
  test('search input has combobox role and aria attributes', () => {
    renderSearch();
    const input = getSearchInput();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-controls')).toBe('search-suggestions');
  });

  test('short input does not trigger suggestions', async () => {
    renderSearch();
    fireEvent.change(getSearchInput(), { target: { value: 'a' } });
    await new Promise(r => setTimeout(r, 400));
    const suggestCalls = mockGet.mock.calls.filter(c => c[0]?.includes('/search/suggest'));
    expect(suggestCalls.length).toBe(0);
  });

  test('form submit fires search, not suggestions', async () => {
    mockGet.mockResolvedValue({ movies: [], content: [], users: [], total: 0 });
    renderSearch();
    fireEvent.change(getSearchInput(), { target: { value: 'batman' } });
    fireEvent.submit(getSearchInput().closest('form'));
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/search?q=batman'));
    });
  });
});
