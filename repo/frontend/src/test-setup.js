import '@testing-library/jest-dom';

// Mock sessionStorage for tests
const store = {};
const mockStorage = {
  getItem: (key) => store[key] || null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: (key) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); }
};
Object.defineProperty(window, 'sessionStorage', { value: mockStorage });
