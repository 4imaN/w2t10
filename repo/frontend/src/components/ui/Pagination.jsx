import React from 'react';

export default function Pagination({ page, pages, onPageChange }) {
  if (pages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <button
        className="btn-outline btn-sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {pages}
      </span>
      <button
        className="btn-outline btn-sm"
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
