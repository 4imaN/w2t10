import React from 'react';
import { RIDE_STATUSES, CONTENT_STATUSES } from '../../utils/constants';

const STATUS_STYLES = {
  pending_match: 'bg-amber-100 text-amber-800',
  accepted: 'bg-violet-100 text-violet-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  canceled: 'bg-gray-100 text-gray-600',
  in_dispute: 'bg-red-100 text-red-800',
  draft: 'bg-gray-100 text-gray-600',
  in_review_1: 'bg-amber-100 text-amber-800',
  in_review_2: 'bg-orange-100 text-orange-800',
  scheduled: 'bg-violet-100 text-violet-800',
  published: 'bg-green-100 text-green-800',
  unpublished: 'bg-gray-200 text-gray-600',
  open: 'bg-red-100 text-red-800',
  investigating: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-800',
  escalated: 'bg-red-200 text-red-900',
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  suspended: 'bg-red-100 text-red-800',
  posted: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-amber-100 text-amber-800',
  reconciled: 'bg-blue-100 text-blue-800'
};

const LABELS = { ...RIDE_STATUSES, ...CONTENT_STATUSES };

export default function StatusBadge({ status, label }) {
  const style = STATUS_STYLES[status] || 'bg-gray-100 text-gray-600';
  const displayLabel = label || LABELS[status] || status?.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors duration-200 ${style}`}>
      {displayLabel}
    </span>
  );
}
