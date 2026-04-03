import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import StatusBadge from '../components/ui/StatusBadge';

describe('StatusBadge Component', () => {
  test('renders status text for ride statuses', () => {
    const { container } = render(<StatusBadge status="pending_match" />);
    expect(container.textContent).toBe('Pending Match');
  });

  test('renders custom label when provided', () => {
    const { container } = render(<StatusBadge status="active" label="Online" />);
    expect(container.textContent).toBe('Online');
  });

  test('renders content statuses', () => {
    const { container: c1 } = render(<StatusBadge status="draft" />);
    expect(c1.textContent).toBe('Draft');
    const { container: c2 } = render(<StatusBadge status="published" />);
    expect(c2.textContent).toBe('Published');
    const { container: c3 } = render(<StatusBadge status="in_review_1" />);
    expect(c3.textContent).toBe('Review Step 1');
  });

  test('applies correct styling classes', () => {
    const { container } = render(<StatusBadge status="completed" />);
    const badge = container.firstChild;
    expect(badge.className).toContain('rounded-full');
    expect(badge.className).toContain('text-xs');
  });

  test('handles unknown status gracefully', () => {
    const { container } = render(<StatusBadge status="unknown_thing" />);
    expect(container.textContent).toBe('unknown thing');
  });
});
