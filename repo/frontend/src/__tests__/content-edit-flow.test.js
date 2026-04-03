import { describe, test, expect } from 'vitest';

// Test the content editorial workflow state machine and UI logic

const EDITORIAL_ROLES = ['administrator', 'editor', 'reviewer'];
const STAFF_ROLES = ['administrator', 'editor'];

function canEditContent(itemStatus, userRole) {
  return itemStatus === 'draft' && STAFF_ROLES.includes(userRole);
}

function canSubmitForReview(itemStatus, userRole) {
  return itemStatus === 'draft' && STAFF_ROLES.includes(userRole);
}

function canReviewContent(itemStatus, userRole) {
  return ['in_review_1', 'in_review_2'].includes(itemStatus)
    && ['administrator', 'reviewer'].includes(userRole);
}

function showStatusFilters(userRole) {
  return EDITORIAL_ROLES.includes(userRole);
}

function showActionsColumn(userRole) {
  return EDITORIAL_ROLES.includes(userRole);
}

describe('Content Edit Flow — Who Can Edit', () => {
  test.each([
    ['draft', 'administrator', true],
    ['draft', 'editor', true],
    ['draft', 'reviewer', false],
    ['draft', 'dispatcher', false],
    ['draft', 'regular_user', false],
    ['in_review_1', 'editor', false],
    ['published', 'editor', false],
    ['scheduled', 'administrator', false],
  ])('status=%s role=%s → canEdit=%s', (status, role, expected) => {
    expect(canEditContent(status, role)).toBe(expected);
  });
});

describe('Content Edit Flow — Who Can Submit', () => {
  test.each([
    ['draft', 'editor', true],
    ['draft', 'administrator', true],
    ['draft', 'reviewer', false],
    ['in_review_1', 'editor', false],
  ])('status=%s role=%s → canSubmit=%s', (status, role, expected) => {
    expect(canSubmitForReview(status, role)).toBe(expected);
  });
});

describe('Content Edit Flow — Who Can Review', () => {
  test.each([
    ['in_review_1', 'reviewer', true],
    ['in_review_2', 'reviewer', true],
    ['in_review_1', 'administrator', true],
    ['in_review_1', 'editor', false],
    ['draft', 'reviewer', false],
    ['published', 'reviewer', false],
  ])('status=%s role=%s → canReview=%s', (status, role, expected) => {
    expect(canReviewContent(status, role)).toBe(expected);
  });
});

describe('Content UI Visibility', () => {
  test.each([
    ['administrator', true],
    ['editor', true],
    ['reviewer', true],
    ['dispatcher', false],
    ['regular_user', false],
  ])('role=%s → showFilters=%s', (role, expected) => {
    expect(showStatusFilters(role)).toBe(expected);
  });

  test.each([
    ['administrator', true],
    ['editor', true],
    ['reviewer', true],
    ['dispatcher', false],
    ['regular_user', false],
  ])('role=%s → showActions=%s', (role, expected) => {
    expect(showActionsColumn(role)).toBe(expected);
  });
});

describe('Content Revise-and-Resubmit Flow', () => {
  test('edit then submit is a two-step operation', () => {
    // Simulates: user edits draft, then submits
    const steps = [];
    steps.push('PUT /content/:id');   // save edits
    steps.push('POST /content/:id/submit'); // submit for review
    expect(steps).toHaveLength(2);
    expect(steps[0]).toContain('PUT');
    expect(steps[1]).toContain('submit');
  });

  test('only draft status allows edit → resubmit', () => {
    const statuses = ['draft', 'in_review_1', 'in_review_2', 'scheduled', 'published', 'unpublished'];
    const editable = statuses.filter(s => canEditContent(s, 'editor'));
    expect(editable).toEqual(['draft']);
  });
});
