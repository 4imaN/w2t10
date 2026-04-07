import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
    post: vi.fn(), put: vi.fn(), delete: vi.fn(),
  }
}));

import SearchPage, { SORT_OPTIONS_BY_TYPE } from '../features/search/SearchPage';

function renderSearch() {
  return render(
    <MemoryRouter initialEntries={['/search']}>
      <SearchPage />
    </MemoryRouter>
  );
}

function getSortSelect() {
  return screen.getByTestId('sort-select');
}

function getTypeButton(label) {
  return screen.getByRole('button', { name: label });
}

function getSortOptionValues() {
  const select = getSortSelect();
  return Array.from(select.querySelectorAll('option')).map(o => o.value);
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ movies: [], content: [], users: [], total: 0, sort_applied: {} });
});

describe('Search Sort — Dynamic Options by Type', () => {
  test('SORT_OPTIONS_BY_TYPE matches backend VALID_SORTS', () => {
    expect(SORT_OPTIONS_BY_TYPE.movie.map(o => o.value).filter(Boolean)).toEqual(['popularity', 'newest', 'rating']);
    expect(SORT_OPTIONS_BY_TYPE.content.map(o => o.value).filter(Boolean)).toEqual(['newest']);
    expect(SORT_OPTIONS_BY_TYPE.user.map(o => o.value).filter(Boolean)).toEqual([]);
  });

  test('default (All) shows all 4 sort options', () => {
    renderSearch();
    expect(getSortOptionValues()).toEqual(['', 'popularity', 'newest', 'rating']);
  });

  test('selecting Movies type shows all 4 sort options', () => {
    renderSearch();
    fireEvent.click(getTypeButton('movies'));
    expect(getSortOptionValues()).toEqual(['', 'popularity', 'newest', 'rating']);
  });

  test('selecting Content type shows only Relevance + Newest', () => {
    renderSearch();
    fireEvent.click(getTypeButton('content'));
    expect(getSortOptionValues()).toEqual(['', 'newest']);
  });

  test('selecting Users type shows only Relevance', () => {
    renderSearch();
    fireEvent.click(getTypeButton('users'));
    expect(getSortOptionValues()).toEqual(['']);
  });

  test('switching back to All restores all sort options', () => {
    renderSearch();
    fireEvent.click(getTypeButton('users'));
    expect(getSortOptionValues()).toEqual(['']);
    fireEvent.click(getTypeButton('All'));
    expect(getSortOptionValues()).toEqual(['', 'popularity', 'newest', 'rating']);
  });
});

describe('Search Sort — Auto-reset on Type Change', () => {
  test('sort resets to relevance when switching to type that does not support it', () => {
    renderSearch();
    fireEvent.change(getSortSelect(), { target: { value: 'popularity' } });
    expect(getSortSelect().value).toBe('popularity');

    fireEvent.click(getTypeButton('content'));
    expect(getSortSelect().value).toBe('');
  });

  test('sort preserved when switching to type that still supports it', () => {
    renderSearch();
    fireEvent.change(getSortSelect(), { target: { value: 'newest' } });
    expect(getSortSelect().value).toBe('newest');

    fireEvent.click(getTypeButton('content'));
    expect(getSortSelect().value).toBe('newest');
  });

  test('sort resets from rating to relevance when switching to Users', () => {
    renderSearch();
    fireEvent.change(getSortSelect(), { target: { value: 'rating' } });
    fireEvent.click(getTypeButton('users'));
    expect(getSortSelect().value).toBe('');
  });
});

describe('Search Sort — API call correctness', () => {
  test('typed content search never sends sort=popularity', async () => {
    renderSearch();
    fireEvent.change(getSortSelect(), { target: { value: 'popularity' } });
    fireEvent.click(getTypeButton('content'));

    fireEvent.change(screen.getByPlaceholderText('Search movies, content, users...'), { target: { value: 'test' } });
    fireEvent.submit(screen.getByPlaceholderText('Search movies, content, users...').closest('form'));

    await vi.waitFor(() => {
      const searchCalls = mockGet.mock.calls.filter(c => c[0]?.includes('/search?'));
      expect(searchCalls.length).toBeGreaterThan(0);
      const lastCall = searchCalls[searchCalls.length - 1][0];
      expect(lastCall).not.toContain('sort=popularity');
    });
  });

  test('typed movie search sends sort=popularity correctly', async () => {
    renderSearch();
    fireEvent.click(getTypeButton('movies'));
    fireEvent.change(getSortSelect(), { target: { value: 'popularity' } });

    fireEvent.change(screen.getByPlaceholderText('Search movies, content, users...'), { target: { value: 'test' } });
    fireEvent.submit(screen.getByPlaceholderText('Search movies, content, users...').closest('form'));

    await vi.waitFor(() => {
      const searchCalls = mockGet.mock.calls.filter(c => c[0]?.includes('/search?'));
      expect(searchCalls.length).toBeGreaterThan(0);
      const lastCall = searchCalls[searchCalls.length - 1][0];
      expect(lastCall).toContain('sort=popularity');
      expect(lastCall).toContain('type=movie');
    });
  });
});
