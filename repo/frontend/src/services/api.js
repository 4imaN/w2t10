const BASE_URL = '/api';

const ROLE_LOGIN_MAP = {
  administrator: '/admin/login',
  editor: '/editor/login',
  reviewer: '/reviewer/login',
  dispatcher: '/dispatcher/login',
  regular_user: '/login',
};

async function request(method, path, body = null, options = {}) {
  const token = sessionStorage.getItem('cineride_token');
  const headers = {};

  if (!(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers,
    ...options
  };

  if (body) {
    config.body = body instanceof FormData ? body : JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, config);

  if (res.status === 401) {
    // Read user role before clearing, to redirect to correct login portal
    const userStr = sessionStorage.getItem('cineride_user');
    let loginPath = '/login';
    try {
      const user = JSON.parse(userStr);
      if (user?.role) loginPath = ROLE_LOGIN_MAP[user.role] || '/login';
    } catch {}
    sessionStorage.removeItem('cineride_token');
    sessionStorage.removeItem('cineride_user');
    if (!path.includes('/auth/login')) {
      window.location.href = loginPath;
    }
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.message || `Request failed with status ${res.status}`);
    error.code = data.code;
    error.status = res.status;
    error.details = data.details;
    throw error;
  }

  return data;
}

const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
  upload: (path, formData) => request('POST', path, formData)
};

export default api;
