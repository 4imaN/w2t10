import { describe, test, expect } from 'vitest';

// Test route guard logic — which roles can access which routes

const ROUTE_PERMISSIONS = {
  '/dashboard': null, // all authenticated
  '/movies': null,
  '/movies/import': ['administrator', 'editor'],
  '/content': null,
  '/rides': null,
  '/dispatch': ['administrator', 'dispatcher'],
  '/sensors': ['administrator', 'dispatcher'],
  '/ledger': ['administrator', 'dispatcher'],
  '/admin/users': ['administrator'],
  '/admin/config': ['administrator'],
  '/search': null,
};

function canAccessRoute(route, userRole) {
  const allowed = ROUTE_PERMISSIONS[route];
  if (allowed === null || allowed === undefined) return true; // all roles
  return allowed.includes(userRole);
}

const ALL_ROLES = ['administrator', 'editor', 'reviewer', 'dispatcher', 'regular_user'];

describe('Route Guards', () => {
  test('all roles can access shared routes', () => {
    const sharedRoutes = ['/dashboard', '/movies', '/content', '/rides', '/search'];
    for (const route of sharedRoutes) {
      for (const role of ALL_ROLES) {
        expect(canAccessRoute(route, role)).toBe(true);
      }
    }
  });

  test('only admin can access admin routes', () => {
    for (const role of ALL_ROLES) {
      expect(canAccessRoute('/admin/users', role)).toBe(role === 'administrator');
      expect(canAccessRoute('/admin/config', role)).toBe(role === 'administrator');
    }
  });

  test('only admin/dispatcher can access dispatch, sensors, ledger', () => {
    for (const role of ALL_ROLES) {
      const expected = ['administrator', 'dispatcher'].includes(role);
      expect(canAccessRoute('/dispatch', role)).toBe(expected);
      expect(canAccessRoute('/sensors', role)).toBe(expected);
      expect(canAccessRoute('/ledger', role)).toBe(expected);
    }
  });

  test('only admin/editor can access movie import', () => {
    for (const role of ALL_ROLES) {
      const expected = ['administrator', 'editor'].includes(role);
      expect(canAccessRoute('/movies/import', role)).toBe(expected);
    }
  });

  test('regular_user cannot access any restricted route', () => {
    const restricted = ['/movies/import', '/dispatch', '/sensors', '/ledger', '/admin/users', '/admin/config'];
    for (const route of restricted) {
      expect(canAccessRoute(route, 'regular_user')).toBe(false);
    }
  });

  test('editor cannot access dispatch or admin', () => {
    expect(canAccessRoute('/dispatch', 'editor')).toBe(false);
    expect(canAccessRoute('/admin/users', 'editor')).toBe(false);
    expect(canAccessRoute('/ledger', 'editor')).toBe(false);
  });
});
