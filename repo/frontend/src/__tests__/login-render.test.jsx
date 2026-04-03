import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

// Mock the auth store
const mockLogin = vi.fn();
vi.mock('../store/authStore', () => ({
  default: Object.assign(
    (selector) => {
      const state = {
        user: null, token: null, loading: false, error: null,
        login: mockLogin,
        logout: vi.fn(),
        isAuthenticated: () => false,
        hasRole: () => false,
      };
      return selector ? selector(state) : state;
    },
    { getState: () => ({ user: null, token: null }), subscribe: vi.fn(), setState: vi.fn() }
  ),
}));

import LoginPage from '../features/auth/LoginPage';

function renderLoginAt(path) {
  // LoginPage reads window.location.pathname for portal detection
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: path, href: `http://localhost${path}` },
    writable: true,
    configurable: true,
  });

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:portal/login" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Login Page Rendering', () => {
  beforeEach(() => { mockLogin.mockReset(); });

  test('admin portal renders correct theme', () => {
    renderLoginAt('/admin/login');
    expect(screen.getByText('Admin Control Center')).toBeTruthy();
    expect(screen.getByText('System Administration Portal')).toBeTruthy();
  });

  test('editor portal renders correct theme', () => {
    renderLoginAt('/editor/login');
    expect(screen.getByText('CineRide Studio')).toBeTruthy();
  });

  test('dispatcher portal renders correct theme', () => {
    renderLoginAt('/dispatcher/login');
    expect(screen.getByText('Dispatch Hub')).toBeTruthy();
  });

  test('default /login renders user portal', () => {
    renderLoginAt('/login');
    expect(screen.getByText('Movies, Content & Rides')).toBeTruthy();
  });

  test('has form inputs and submit button', () => {
    renderLoginAt('/login');
    expect(screen.getByPlaceholderText('Enter your username')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter your password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
  });

  test('admin portal sends portal=admin on submit', async () => {
    mockLogin.mockResolvedValueOnce(false);
    renderLoginAt('/admin/login');
    fireEvent.change(screen.getByPlaceholderText('Enter your username'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => { expect(mockLogin).toHaveBeenCalledWith('admin', 'pass', 'admin'); });
  });

  test('user portal sends portal=user on submit', async () => {
    mockLogin.mockResolvedValueOnce(false);
    renderLoginAt('/login');
    fireEvent.change(screen.getByPlaceholderText('Enter your username'), { target: { value: 'u' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'p' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => { expect(mockLogin).toHaveBeenCalledWith('u', 'p', 'user'); });
  });
});
