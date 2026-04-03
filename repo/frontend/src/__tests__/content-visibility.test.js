import { describe, test, expect } from 'vitest';

// Test the RBAC logic that determines which roles see what content
// This validates the business rules independent of React rendering

const EDITORIAL_ROLES = ['administrator', 'editor', 'reviewer'];

function canSeeNonPublishedContent(role) {
  return EDITORIAL_ROLES.includes(role);
}

function getContentListFilter(role) {
  if (!EDITORIAL_ROLES.includes(role)) {
    return { status: 'published' };
  }
  return {};
}

function canAccessContentDetail(itemStatus, role) {
  if (itemStatus === 'published') return true;
  return EDITORIAL_ROLES.includes(role);
}

describe('Content Visibility Rules', () => {
  describe('List filtering', () => {
    test('regular_user sees only published', () => {
      expect(getContentListFilter('regular_user')).toEqual({ status: 'published' });
    });

    test('dispatcher sees only published', () => {
      expect(getContentListFilter('dispatcher')).toEqual({ status: 'published' });
    });

    test('editor sees all statuses', () => {
      expect(getContentListFilter('editor')).toEqual({});
    });

    test('reviewer sees all statuses', () => {
      expect(getContentListFilter('reviewer')).toEqual({});
    });

    test('administrator sees all statuses', () => {
      expect(getContentListFilter('administrator')).toEqual({});
    });
  });

  describe('Detail access', () => {
    test.each([
      ['published', 'regular_user', true],
      ['published', 'dispatcher', true],
      ['draft', 'regular_user', false],
      ['draft', 'dispatcher', false],
      ['in_review_1', 'regular_user', false],
      ['in_review_1', 'dispatcher', false],
      ['scheduled', 'regular_user', false],
      ['draft', 'editor', true],
      ['draft', 'reviewer', true],
      ['draft', 'administrator', true],
      ['in_review_1', 'reviewer', true],
      ['in_review_2', 'editor', true],
    ])('status=%s role=%s → access=%s', (status, role, expected) => {
      expect(canAccessContentDetail(status, role)).toBe(expected);
    });
  });

  describe('Non-published visibility', () => {
    test.each([
      ['administrator', true],
      ['editor', true],
      ['reviewer', true],
      ['dispatcher', false],
      ['regular_user', false],
    ])('role=%s can see non-published: %s', (role, expected) => {
      expect(canSeeNonPublishedContent(role)).toBe(expected);
    });
  });
});
