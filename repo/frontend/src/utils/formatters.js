import { format, formatDistanceToNow } from 'date-fns';

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return format(new Date(dateStr), 'MM/dd/yyyy');
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return format(new Date(dateStr), 'MM/dd/yyyy hh:mm a');
}

export function formatRelativeTime(dateStr) {
  if (!dateStr) return '—';
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

export function formatCurrency(amount) {
  if (amount == null) return '—';
  return `$${Number(amount).toFixed(2)}`;
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}
