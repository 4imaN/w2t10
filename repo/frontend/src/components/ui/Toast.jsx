import React, { useState, useEffect } from 'react';
import { create } from 'zustand';

export const useToastStore = create((set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Date.now();
    set(state => ({
      toasts: [...state.toasts, { id, message, type }]
    }));
    setTimeout(() => {
      set(state => ({
        toasts: state.toasts.filter(t => t.id !== id)
      }));
    }, 4000);
  },
  removeToast: (id) => set(state => ({
    toasts: state.toasts.filter(t => t.id !== id)
  }))
}));

const TYPE_STYLES = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-gray-800 text-white'
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm animate-slide-in ${TYPE_STYLES[toast.type] || TYPE_STYLES.info}`}
          onClick={() => removeToast(toast.id)}
          role="alert"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
