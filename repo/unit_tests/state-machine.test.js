const { validateRideTransition, validateContentTransition } = require('../api/src/utils/state-machine');

describe('State Machine', () => {
  describe('Ride Transitions', () => {
    test('allows valid transitions', () => {
      expect(validateRideTransition('pending_match', 'accepted')).toBe(true);
      expect(validateRideTransition('pending_match', 'canceled')).toBe(true);
      expect(validateRideTransition('accepted', 'in_progress')).toBe(true);
      expect(validateRideTransition('in_progress', 'completed')).toBe(true);
      expect(validateRideTransition('in_progress', 'in_dispute')).toBe(true);
      expect(validateRideTransition('completed', 'in_dispute')).toBe(true);
      expect(validateRideTransition('in_dispute', 'completed')).toBe(true);
    });

    test('rejects invalid transitions', () => {
      expect(validateRideTransition('pending_match', 'completed')).toBe(false);
      expect(validateRideTransition('canceled', 'accepted')).toBe(false);
      expect(validateRideTransition('completed', 'pending_match')).toBe(false);
      expect(validateRideTransition('pending_match', 'in_progress')).toBe(false);
    });

    test('canceled is terminal', () => {
      expect(validateRideTransition('canceled', 'pending_match')).toBe(false);
      expect(validateRideTransition('canceled', 'accepted')).toBe(false);
      expect(validateRideTransition('canceled', 'completed')).toBe(false);
    });
  });

  describe('Content Transitions', () => {
    test('allows valid transitions', () => {
      expect(validateContentTransition('draft', 'in_review_1')).toBe(true);
      expect(validateContentTransition('in_review_1', 'in_review_2')).toBe(true);
      expect(validateContentTransition('in_review_1', 'draft')).toBe(true); // rejection
      expect(validateContentTransition('in_review_2', 'published')).toBe(true);
      expect(validateContentTransition('in_review_2', 'scheduled')).toBe(true);
      expect(validateContentTransition('scheduled', 'published')).toBe(true);
      expect(validateContentTransition('published', 'unpublished')).toBe(true);
    });

    test('rejects invalid transitions', () => {
      expect(validateContentTransition('draft', 'published')).toBe(false);
      expect(validateContentTransition('draft', 'in_review_2')).toBe(false);
      expect(validateContentTransition('published', 'draft')).toBe(false);
    });
  });
});
