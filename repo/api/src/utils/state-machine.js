/**
 * Generic state machine validator.
 * Define allowed transitions as a map of { fromState: [toState1, toState2, ...] }
 */

const RIDE_TRANSITIONS = {
  pending_match: ['accepted', 'canceled'],
  accepted: ['in_progress', 'canceled', 'in_dispute'],
  in_progress: ['completed', 'in_dispute'],
  completed: ['in_dispute'],
  in_dispute: ['completed', 'canceled'],
  canceled: [] // terminal
};

const CONTENT_TRANSITIONS = {
  draft: ['in_review_1'],
  in_review_1: ['in_review_2', 'draft'], // approved → in_review_2, rejected → draft
  in_review_2: ['scheduled', 'published', 'draft'], // approved → scheduled/published, rejected → draft
  scheduled: ['published', 'unpublished'],
  published: ['unpublished'],
  unpublished: ['draft']
};

function isValidTransition(transitions, fromState, toState) {
  const allowed = transitions[fromState];
  if (!allowed) return false;
  return allowed.includes(toState);
}

function validateRideTransition(fromState, toState) {
  return isValidTransition(RIDE_TRANSITIONS, fromState, toState);
}

function validateContentTransition(fromState, toState) {
  return isValidTransition(CONTENT_TRANSITIONS, fromState, toState);
}

module.exports = {
  RIDE_TRANSITIONS,
  CONTENT_TRANSITIONS,
  isValidTransition,
  validateRideTransition,
  validateContentTransition
};
