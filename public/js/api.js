/**
 * Thin client for the REST API. Everything the pages need goes through here so
 * there is one place that knows about the token and the error shape.
 */

const TOKEN_KEY = 'clf.token';
const USER_KEY = 'clf.user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAdmin() {
  const user = getUser();
  return !!user && user.role === 'admin';
}

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors || [];
  }
}

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    // FormData sets its own multipart boundary; never set Content-Type here.
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { success: false, message: 'The server returned an unreadable response.' };
  }

  if (!res.ok || data.success === false) {
    if (res.status === 401 && getToken()) clearSession();
    throw new ApiError(data.message || 'Request failed.', res.status, data.errors);
  }
  return data.data;
}

const qs = (params) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') search.set(k, v);
  });
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  // auth
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  me: () => request('/auth/me'),
  updateProfile: (body) => request('/auth/me', { method: 'PATCH', body }),
  changePassword: (body) => request('/auth/password', { method: 'PATCH', body }),
  forgotPassword: (body) => request('/auth/forgot-password', { method: 'POST', body }),
  verifyOtp: (body) => request('/auth/verify-otp', { method: 'POST', body }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body }),

  // meta
  categories: () => request('/categories'),
  buildings: () => request('/locations'),

  // items
  listItems: (params) => request(`/items${qs(params)}`),
  getItem: (id) => request(`/items/${id}`),
  myItems: () => request('/items/mine'),
  createItem: (form) => request('/items', { method: 'POST', form }),
  updateItem: (id, body) => request(`/items/${id}`, { method: 'PATCH', body }),
  updateItemForm: (id, form) => request(`/items/${id}`, { method: 'PATCH', form }),
  deleteItem: (id) => request(`/items/${id}`, { method: 'DELETE' }),
  setStatus: (id, body) => request(`/items/${id}/status`, { method: 'PATCH', body }),
  itemMatches: (id) => request(`/items/${id}/matches`),
  itemClaims: (id) => request(`/items/${id}/claims`),

  // claims
  createClaim: (id, form) => request(`/items/${id}/claims`, { method: 'POST', form }),
  myClaims: () => request('/claims/mine'),
  listClaims: (params) => request(`/claims${qs(params)}`),
  decideClaim: (id, body) => request(`/claims/${id}`, { method: 'PATCH', body }),
  cancelClaim: (id) => request(`/claims/${id}/cancel`, { method: 'PATCH' }),
  collectClaim: (id, body) => request(`/claims/${id}/collect`, { method: 'POST', body }),
  claimProof: (id) => request(`/claims/${id}/proof`),

  // notifications
  notifications: () => request('/notifications'),
  markRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request('/notifications/read-all', { method: 'POST' }),

  // admin
  stats: () => request('/admin/stats'),
  charts: () => request('/admin/charts'),
  adminItems: (params) => request(`/admin/items${qs(params)}`),
  adminUsers: (params) => request(`/admin/users${qs(params)}`),
  updateUser: (id, body) => request(`/admin/users/${id}`, { method: 'PATCH', body }),
  deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  auditLog: (params) => request(`/admin/audit-log${qs(params)}`),
  duplicates: () => request('/admin/duplicates'),
};
