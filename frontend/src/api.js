const API_BASE = 'http://127.0.0.1:3000';

async function request(path, method = 'GET', body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export const login = (username, password) => request('/auth/login', 'POST', { username, password });
export const register = (username, password, displayName) => request('/auth/register', 'POST', { username, password, displayName });
export const getCategories = (token) => request('/categories', 'GET', null, token);
export const createCategory = (name, color, token) => request('/categories', 'POST', { name, color }, token);
export const getTasks = (token) => request('/tasks', 'GET', null, token);
export const createTask = (payload, token) => request('/tasks', 'POST', payload, token);
