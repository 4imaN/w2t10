import React, { useEffect } from 'react';

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    if (isOpen) {
      window.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white dark:bg-gray-900 w-full ${sizeClasses[size]} sm:mx-4 sm:rounded-lg rounded-t-2xl shadow-xl max-h-[95vh] sm:max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between p-3 sm:p-4 border-b flex-shrink-0">
          {/* Mobile drag handle */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-gray-300 dark:bg-gray-700 rounded-full sm:hidden" />
          <h2 className="text-base sm:text-lg font-semibold truncate pr-2 mt-1 sm:mt-0">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-sm flex-shrink-0">✕</button>
        </div>
        <div className="p-3 sm:p-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
