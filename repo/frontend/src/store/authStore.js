import { create } from 'zustand';
import api from '../services/api';

// Use sessionStorage instead of localStorage for token storage.
// sessionStorage is scoped to the browser tab and cleared on close,
// reducing exposure window for XSS-stolen tokens compared to localStorage.
// A full httpOnly-cookie migration would eliminate client-side token access entirely
// but requires backend cookie-setting endpoints and CSRF protection — deferred.
const storage = sessionStorage;

const STORAGE_KEYS = {
  token: 'cineride_token',
  user: 'cineride_user',
};

// Migrate any leftover localStorage tokens to sessionStorage on first load
// (one-time cleanup from previous architecture)
function migrateFromLocalStorage() {
  const oldToken = localStorage.getItem(STORAGE_KEYS.token);
  if (oldToken) {
    storage.setItem(STORAGE_KEYS.token, oldToken);
    storage.setItem(STORAGE_KEYS.user, localStorage.getItem(STORAGE_KEYS.user) || 'null');
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.user);
  }
}
migrateFromLocalStorage();

function readUser() {
  try {
    return JSON.parse(storage.getItem(STORAGE_KEYS.user) || 'null');
  } catch {
    return null;
  }
}

const useAuthStore = create((set, get) => ({
  user: readUser(),
  token: storage.getItem(STORAGE_KEYS.token) || null,
  loading: false,
  error: null,

  mustChangePassword: false,

  login: async (username, password, portal = null) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post('/auth/login', { username, password, portal });
      const { token, user, must_change_password } = res;
      storage.setItem(STORAGE_KEYS.token, token);
      storage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
      set({ user, token, loading: false, mustChangePassword: !!must_change_password });
      return true;
    } catch (err) {
      set({ error: err.message || 'Login failed', loading: false });
      return false;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    storage.removeItem(STORAGE_KEYS.token);
    storage.removeItem(STORAGE_KEYS.user);
    set({ user: null, token: null });
  },

  clearSession: () => {
    storage.removeItem(STORAGE_KEYS.token);
    storage.removeItem(STORAGE_KEYS.user);
    set({ user: null, token: null });
  },

  isAuthenticated: () => !!get().token && !!get().user,

  hasRole: (...roles) => {
    const user = get().user;
    return user && roles.includes(user.role);
  }
}));

export default useAuthStore;
