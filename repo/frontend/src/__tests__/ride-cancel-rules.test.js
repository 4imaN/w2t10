import { describe, test, expect } from 'vitest';

// Test ride cancellation rule logic as enforced in the UI

const FREE_CANCEL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function isFreeCancellation(createdAt) {
  const created = new Date(createdAt);
  const freeUntil = new Date(created.getTime() + FREE_CANCEL_WINDOW_MS);
  return new Date() <= freeUntil;
}

function canShowCancelButton(status) {
  return ['pending_match', 'accepted'].includes(status);
}

function canShowDisputeButton(status) {
  return ['accepted', 'in_progress', 'completed'].includes(status);
}

function canShowFeedbackButton(status, existingRating) {
  return status === 'completed' && !existingRating;
}

describe('Ride Cancellation Rules (UI)', () => {
  test('free cancellation within 5 minutes of creation', () => {
    const justNow = new Date().toISOString();
    expect(isFreeCancellation(justNow)).toBe(true);
  });

  test('not free cancellation after 5 minutes', () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    expect(isFreeCancellation(sixMinutesAgo)).toBe(false);
  });

  test('exactly at 5 minute boundary is still free (<=)', () => {
    const exactlyFiveMinAgo = new Date(Date.now() - FREE_CANCEL_WINDOW_MS).toISOString();
    // The check uses <= so at exactly the boundary it's still free
    expect(isFreeCancellation(exactlyFiveMinAgo)).toBe(true);
  });

  test('one second past 5 minutes is not free', () => {
    const pastBoundary = new Date(Date.now() - FREE_CANCEL_WINDOW_MS - 1000).toISOString();
    expect(isFreeCancellation(pastBoundary)).toBe(false);
  });
});

describe('Ride Action Visibility', () => {
  test.each([
    ['pending_match', true],
    ['accepted', true],
    ['in_progress', false],
    ['completed', false],
    ['canceled', false],
    ['in_dispute', false],
  ])('cancel button visible for status=%s → %s', (status, expected) => {
    expect(canShowCancelButton(status)).toBe(expected);
  });

  test.each([
    ['pending_match', false],
    ['accepted', true],
    ['in_progress', true],
    ['completed', true],
    ['canceled', false],
    ['in_dispute', false],
  ])('dispute button visible for status=%s → %s', (status, expected) => {
    expect(canShowDisputeButton(status)).toBe(expected);
  });

  test.each([
    ['completed', null, true],
    ['completed', 5, false],
    ['in_progress', null, false],
    ['canceled', null, false],
  ])('feedback button for status=%s rating=%s → %s', (status, rating, expected) => {
    expect(canShowFeedbackButton(status, rating)).toBe(expected);
  });
});

// ── Client-side ride form validation ──────────────────────────────
const MIN_LEAD_MS = 5 * 60 * 1000;
const MAX_WINDOW_MS = 4 * 60 * 60 * 1000;

function validateRideForm(startStr, endStr) {
  const errors = [];
  const start = new Date(startStr);
  const end = new Date(endStr);
  const now = new Date();

  if (!startStr || !endStr) {
    errors.push('Both start and end times are required.');
  } else if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    errors.push('Invalid date/time values.');
  } else {
    if (start < new Date(now.getTime() + MIN_LEAD_MS)) {
      errors.push('Start time must be at least 5 minutes from now.');
    }
    if (end <= start) {
      errors.push('End time must be after start time.');
    }
    if (end - start > MAX_WINDOW_MS) {
      errors.push('Time window cannot exceed 4 hours.');
    }
  }
  return errors;
}

describe('Ride Form Client Validation', () => {
  test('valid future times with <= 4 hour window passes', () => {
    const start = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 70 * 60 * 1000).toISOString();
    expect(validateRideForm(start, end)).toEqual([]);
  });

  test('start time in the past fails', () => {
    const start = new Date(Date.now() - 60 * 1000).toISOString();
    const end = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const errors = validateRideForm(start, end);
    expect(errors.some(e => e.includes('5 minutes'))).toBe(true);
  });

  test('start less than 5 min from now fails', () => {
    const start = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const errors = validateRideForm(start, end);
    expect(errors.some(e => e.includes('5 minutes'))).toBe(true);
  });

  test('end before start fails', () => {
    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const errors = validateRideForm(start, end);
    expect(errors.some(e => e.includes('after start'))).toBe(true);
  });

  test('window > 4 hours fails', () => {
    const start = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    const errors = validateRideForm(start, end);
    expect(errors.some(e => e.includes('4 hours'))).toBe(true);
  });

  test('exactly 4 hours is valid', () => {
    const start = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 10 * 60 * 1000 + MAX_WINDOW_MS).toISOString();
    expect(validateRideForm(start, end)).toEqual([]);
  });

  test('missing times fails', () => {
    expect(validateRideForm('', '')).toEqual(['Both start and end times are required.']);
  });
});
