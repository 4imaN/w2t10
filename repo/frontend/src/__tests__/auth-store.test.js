import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock the api module before importing the store
vi.mock('../services/api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  }
}));

describe('Auth Store', () => {
  let useAuthStore;
  let api;

  beforeEach(async () => {
    sessionStorage.clear();
    vi.resetModules();
    // Re-import to get fresh store
    const storeModule = await import('../store/authStore');
    useAuthStore = storeModule.default;
    const apiModule = await import('../services/api');
    api = apiModule.default;
  });

  test('starts with null user and token when sessionStorage is empty', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });

  test('login stores token and user in sessionStorage', async () => {
    api.post.mockResolvedValueOnce({
      token: 'test-jwt-token',
      user: { id: '1', username: 'admin', role: 'administrator', display_name: 'Admin' }
    });

    const result = await useAuthStore.getState().login('admin', 'pass');
    expect(result).toBe(true);

    const state = useAuthStore.getState();
    expect(state.token).toBe('test-jwt-token');
    expect(state.user.username).toBe('admin');
    expect(sessionStorage.getItem('cineride_token')).toBe('test-jwt-token');
  });

  test('login returns false on failure and sets error', async () => {
    api.post.mockRejectedValueOnce(new Error('Invalid credentials'));

    const result = await useAuthStore.getState().login('bad', 'bad');
    expect(result).toBe(false);
    expect(useAuthStore.getState().error).toBe('Invalid credentials');
    expect(useAuthStore.getState().token).toBeNull();
  });

  test('logout clears sessionStorage and state', async () => {
    // First login
    api.post.mockResolvedValueOnce({
      token: 'tok', user: { id: '1', username: 'u', role: 'regular_user' }
    });
    await useAuthStore.getState().login('u', 'p');
    expect(useAuthStore.getState().token).toBe('tok');

    // Then logout
    api.post.mockResolvedValueOnce({});
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(sessionStorage.getItem('cineride_token')).toBeNull();
  });

  test('login sends portal parameter to API', async () => {
    api.post.mockResolvedValueOnce({
      token: 'tok', user: { id: '1', username: 'admin', role: 'administrator' }
    });
    await useAuthStore.getState().login('admin', 'pass', 'admin');
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      username: 'admin', password: 'pass', portal: 'admin'
    });
  });

  test('hasRole checks user role correctly', async () => {
    api.post.mockResolvedValueOnce({
      token: 'tok', user: { id: '1', username: 'ed', role: 'editor' }
    });
    await useAuthStore.getState().login('ed', 'p');

    expect(useAuthStore.getState().hasRole('editor')).toBe(true);
    expect(useAuthStore.getState().hasRole('administrator')).toBe(false);
    expect(useAuthStore.getState().hasRole('editor', 'administrator')).toBe(true);
  });
});
