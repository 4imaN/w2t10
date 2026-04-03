import { describe, test, expect } from 'vitest';

// Test the async state machine logic used by the dashboard
// This validates the three-state (loading/error/data) behavior

function processSectionResult(settledResult) {
  if (settledResult.status === 'fulfilled') {
    return { data: settledResult.value, error: null };
  }
  return { data: null, error: settledResult.reason?.message || 'Unknown error' };
}

describe('Dashboard Async State Handling', () => {
  test('fulfilled result returns data with no error', () => {
    const result = processSectionResult({
      status: 'fulfilled',
      value: { rides: [{ _id: '1' }], total: 1 }
    });
    expect(result.data).toEqual({ rides: [{ _id: '1' }], total: 1 });
    expect(result.error).toBeNull();
  });

  test('rejected result returns null data with error message', () => {
    const result = processSectionResult({
      status: 'rejected',
      reason: new Error('Network timeout')
    });
    expect(result.data).toBeNull();
    expect(result.error).toBe('Network timeout');
  });

  test('rejected result with no message gives fallback', () => {
    const result = processSectionResult({
      status: 'rejected',
      reason: {}
    });
    expect(result.data).toBeNull();
    expect(result.error).toBe('Unknown error');
  });

  test('each section is independent — one failure does not affect others', () => {
    const results = [
      { status: 'fulfilled', value: { rides: [] } },
      { status: 'rejected', reason: new Error('DB down') },
      { status: 'fulfilled', value: { movies: [{ _id: 'a' }] } },
    ].map(processSectionResult);

    expect(results[0].error).toBeNull();
    expect(results[0].data.rides).toEqual([]);
    expect(results[1].error).toBe('DB down');
    expect(results[1].data).toBeNull();
    expect(results[2].error).toBeNull();
    expect(results[2].data.movies).toHaveLength(1);
  });
});

describe('Dashboard State Rendering Logic', () => {
  function getDisplayState(loading, error, dataLength) {
    if (loading) return 'skeleton';
    if (error) return 'error';
    if (dataLength === 0) return 'empty';
    return 'data';
  }

  test.each([
    [true, null, 0, 'skeleton'],
    [true, null, 5, 'skeleton'],
    [false, 'Network error', 0, 'error'],
    [false, null, 0, 'empty'],
    [false, null, 3, 'data'],
  ])('loading=%s error=%s count=%s → %s', (loading, error, count, expected) => {
    expect(getDisplayState(loading, error, count)).toBe(expected);
  });
});
