import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import Modal from '../components/ui/Modal';

describe('Modal Component', () => {
  test('renders nothing when closed', () => {
    const { container } = render(<Modal isOpen={false} onClose={() => {}} title="Test">Content</Modal>);
    expect(container.innerHTML).toBe('');
  });

  test('renders title and children when open', () => {
    render(<Modal isOpen={true} onClose={() => {}} title="My Title"><p>Body text</p></Modal>);
    expect(screen.getByText('My Title')).toBeTruthy();
    expect(screen.getByText('Body text')).toBeTruthy();
  });

  test('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<Modal isOpen={true} onClose={onClose} title="Test">Content</Modal>);
    fireEvent.click(screen.getByText('✕'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose on backdrop click', () => {
    const onClose = vi.fn();
    const { container } = render(<Modal isOpen={true} onClose={onClose} title="Test">Content</Modal>);
    // The backdrop is the first fixed div with bg-black
    const backdrop = container.querySelector('.bg-black\\/50');
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  test('renders with mobile-friendly classes', () => {
    const { container } = render(<Modal isOpen={true} onClose={() => {}} title="Test" size="lg">Content</Modal>);
    // Should have responsive max-width
    const modalContent = container.querySelector('[class*="sm:max-w"]');
    expect(modalContent).toBeTruthy();
  });
});
