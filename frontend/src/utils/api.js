import { ensureDemoSession } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseResponse(response) {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }

  const text = await response.text();
  return text || null;
}

function createApiError(status, data, message) {
  const error = new Error(message || `Request failed with status ${status}`);
  error.response = { status, data };
  return error;
}

function clearSession() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('token');
  localStorage.removeItem('userName');
}

async function request(path, {
  method = 'GET',
  body,
  headers: customHeaders,
  auth = true,
  signal,
  _demoRetried = false,
} = {}) {
  const headers = new Headers(customHeaders || {});
  headers.set('Accept', 'application/json');

  const token = auth ? localStorage.getItem('access_token') : null;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let requestBody = body;
  if (body !== undefined && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(buildUrl(path), {
      method,
      headers,
      body: requestBody,
      signal,
    });
  } catch (cause) {
    const error = createApiError(0, null, cause?.message || 'Network request failed');
    error.cause = cause;
    throw error;
  }

  if (response.status === 401 && auth) {
    if (!token && !_demoRetried) {
      const demoToken = await ensureDemoSession();
      if (demoToken) {
        return request(path, {
          method,
          body,
          headers: customHeaders,
          auth,
          signal,
          _demoRetried: true,
        });
      }
    }

    clearSession();
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  const data = await parseResponse(response);
  if (!response.ok) {
    const message = data?.detail || data?.error || data?.message || `Request failed with status ${response.status}`;
    throw createApiError(response.status, data, message);
  }

  return {
    data,
    status: response.status,
    headers: response.headers,
  };
}

export const api = {
  get(path, options) {
    return request(path, { ...options, method: 'GET' });
  },
  post(path, body, options) {
    return request(path, { ...options, method: 'POST', body });
  },
  patch(path, body, options) {
    return request(path, { ...options, method: 'PATCH', body });
  },
  request,
};

export default api;
