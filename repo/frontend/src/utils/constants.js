export const ROLES = {
  ADMIN: 'administrator',
  EDITOR: 'editor',
  REVIEWER: 'reviewer',
  DISPATCHER: 'dispatcher',
  USER: 'regular_user'
};

export const ROLE_LABELS = {
  administrator: 'Admin',
  editor: 'Editor',
  reviewer: 'Reviewer',
  dispatcher: 'Dispatcher',
  regular_user: 'User'
};

export const ROLE_COLORS = {
  administrator: 'bg-red-100 text-red-800',
  editor: 'bg-blue-100 text-blue-800',
  reviewer: 'bg-purple-100 text-purple-800',
  dispatcher: 'bg-orange-100 text-orange-800',
  regular_user: 'bg-gray-100 text-gray-800'
};

export const RIDE_STATUSES = {
  pending_match: 'Pending Match',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  completed: 'Completed',
  canceled: 'Canceled',
  in_dispute: 'In Dispute'
};

export const CONTENT_STATUSES = {
  draft: 'Draft',
  in_review_1: 'Review Step 1',
  in_review_2: 'Review Step 2',
  scheduled: 'Scheduled',
  published: 'Published',
  unpublished: 'Unpublished'
};

export const MPAA_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR'];

export const VEHICLE_TYPES = ['sedan', 'suv', 'van', 'shuttle'];

export const CONTENT_TYPES = ['article', 'gallery', 'video', 'event'];

export const DISPUTE_REASONS = ['no_show', 'wrong_route', 'fare_dispute', 'service_complaint', 'other'];

export const DISPUTE_RESOLUTIONS = [
  'resolved_in_favor_of_rider',
  'resolved_in_favor_of_driver',
  'partial_refund',
  'no_action',
  'escalated'
];
