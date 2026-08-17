/* NF Sistema - API Layer */

const API_URL = '/api';
let authToken = localStorage.getItem('nf_token');

class APIError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new APIError(
        data?.message || `API Error: ${response.statusText}`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(error.message || 'Network error', 0, null);
  }
}

export function setAuthToken(token) {
  authToken = token;
  localStorage.setItem('nf_token', token);
}

export function clearAuthToken() {
  authToken = null;
  localStorage.removeItem('nf_token');
}

// Auth endpoints
export const auth = {
  login: (email, password) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getCurrentUser: () =>
    apiFetch('/auth/me'),

  forgotPassword: (email) =>
    apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  activateInfo: (token) =>
    apiFetch(`/auth/activate-info?token=${encodeURIComponent(token)}`),

  activate: (token, password, password_confirmation) =>
    apiFetch('/auth/activate', {
      method: 'POST',
      body: JSON.stringify({ token, password, password_confirmation }),
    }),

  changePassword: (current_password, new_password) =>
    apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),
};

// Users endpoints (admin-only)
export const users = {
  list: () =>
    apiFetch('/users'),

  get: (id) =>
    apiFetch(`/users/${id}`),

  create: (data) =>
    apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    apiFetch(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id) =>
    apiFetch(`/users/${id}`, {
      method: 'DELETE',
    }),

  resendInvite: (id) =>
    apiFetch(`/users/${id}/resend-invite`, {
      method: 'POST',
    }),
};

// Customers endpoints
export const customers = {
  list: () =>
    apiFetch('/customers'),

  get: (id) =>
    apiFetch(`/customers/${id}`),

  create: (data) =>
    apiFetch('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    apiFetch(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id) =>
    apiFetch(`/customers/${id}`, {
      method: 'DELETE',
    }),
};

// Companies endpoints
export const companies = {
  list: () =>
    apiFetch('/companies'),

  get: (id) =>
    apiFetch(`/companies/${id}`),

  create: (data) =>
    apiFetch('/companies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    apiFetch(`/companies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id) =>
    apiFetch(`/companies/${id}`, {
      method: 'DELETE',
    }),
};

// Invoices endpoints
export const invoices = {
  list: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value);
      }
    });
    return apiFetch(`/invoices?${params.toString()}`);
  },

  get: (id) =>
    apiFetch(`/invoices/${id}`),

  create: (data) =>
    apiFetch('/invoices', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    apiFetch(`/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id) =>
    apiFetch(`/invoices/${id}`, {
      method: 'DELETE',
    }),
};

// Reports endpoints
export const reports = {
  summary: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value);
      }
    });
    return apiFetch(`/reports/summary?${params.toString()}`);
  },
};
