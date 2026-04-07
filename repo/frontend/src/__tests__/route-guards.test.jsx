import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import App from '../App';

const ALL_ROLES = ['administrator', 'editor', 'reviewer', 'dispatcher', 'regular_user'];

function setAuth(role) {
  useAuthStore.setState({
    user: { _id: 'test-id', username: `test_${role}`, role, display_name: role },
    token: 'fake-jwt-token',
    mustChangePassword: false,
  });
}

function clearAuth() {
  useAuthStore.setState({ user: null, token: null, mustChangePassword: false });
}

function renderRoute(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

beforeEach(() => {
  clearAuth();
});

describe('Route Guards — Unauthenticated', () => {
  test('unauthenticated user visiting /movies is redirected to /login', () => {
    renderRoute('/movies');
    expect(screen.queryByText(/Sign in/i) || screen.queryByText(/Login/i) || screen.queryByText(/username/i)).toBeTruthy();
  });

  test('unauthenticated user visiting /admin/users is redirected to /login', () => {
    renderRoute('/admin/users');
    expect(screen.queryByText(/Sign in/i) || screen.queryByText(/Login/i) || screen.queryByText(/username/i)).toBeTruthy();
  });
});

describe('Route Guards — Shared routes accessible to all roles', () => {
  const sharedPaths = ['/movies', '/content', '/rides', '/search'];

  for (const role of ALL_ROLES) {
    for (const path of sharedPaths) {
      test(`${role} can access ${path}`, () => {
        setAuth(role);
        renderRoute(path);
        const loginForm = screen.queryByLabelText(/username/i);
        expect(loginForm).toBeNull();
      });
    }
  }
});

describe('Route Guards — Admin-only routes', () => {
  const adminOnlyPaths = ['/admin/users', '/admin/config'];

  test('administrator can access admin routes', () => {
    setAuth('administrator');
    for (const path of adminOnlyPaths) {
      const { unmount } = renderRoute(path);
      expect(screen.queryByLabelText(/username/i)).toBeNull();
      unmount();
    }
  });

  for (const role of ['editor', 'reviewer', 'dispatcher', 'regular_user']) {
    test(`${role} is redirected away from admin routes`, () => {
      setAuth(role);
      const { unmount } = renderRoute('/admin/users');
      expect(screen.queryByLabelText(/username/i)).toBeNull();
      unmount();
    });
  }
});

describe('Route Guards — Dispatch/Sensors/Ledger (admin + dispatcher)', () => {
  const restrictedPaths = ['/dispatch', '/sensors', '/ledger'];

  for (const role of ['administrator', 'dispatcher']) {
    test(`${role} can access dispatch/sensors/ledger`, () => {
      setAuth(role);
      for (const path of restrictedPaths) {
        const { unmount } = renderRoute(path);
        expect(screen.queryByLabelText(/username/i)).toBeNull();
        unmount();
      }
    });
  }

  for (const role of ['editor', 'reviewer', 'regular_user']) {
    test(`${role} is redirected from dispatch`, () => {
      setAuth(role);
      const { unmount } = renderRoute('/dispatch');
      expect(screen.queryByLabelText(/username/i)).toBeNull();
      unmount();
    });
  }
});

describe('Route Guards — Movie Import (admin + editor)', () => {
  test('administrator can access /movies/import', () => {
    setAuth('administrator');
    renderRoute('/movies/import');
    expect(screen.queryByLabelText(/username/i)).toBeNull();
  });

  test('editor can access /movies/import', () => {
    setAuth('editor');
    renderRoute('/movies/import');
    expect(screen.queryByLabelText(/username/i)).toBeNull();
  });

  for (const role of ['reviewer', 'dispatcher', 'regular_user']) {
    test(`${role} is redirected from /movies/import`, () => {
      setAuth(role);
      renderRoute('/movies/import');
      expect(screen.queryByLabelText(/username/i)).toBeNull();
    });
  }
});
