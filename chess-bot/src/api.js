/**
 * api.js — Thin wrapper around the chess-backend REST API.
 * Falls back gracefully if the backend is not running.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ─── Token helpers ────────────────────────────────────────────────────────────

export function getToken() {
  return localStorage.getItem('chess_access_token');
}

function setTokens(accessToken, refreshToken) {
  localStorage.setItem('chess_access_token', accessToken);
  localStorage.setItem('chess_refresh_token', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('chess_access_token');
  localStorage.removeItem('chess_refresh_token');
}

// ─── Fetch wrapper ────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || 'API error');
  }

  return data;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function apiRegister(username, email, password) {
  const data = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: { username, email, password },
  });
  setTokens(data.data.accessToken, data.data.refreshToken);
  return data.data.user;
}

export async function apiLogin(loginId, password) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: { loginId, password },
  });
  setTokens(data.data.accessToken, data.data.refreshToken);
  return data.data.user;
}

export async function apiLogout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch { /* ignore */ }
  clearTokens();
}

export async function apiGetMe() {
  const data = await apiFetch('/api/auth/me');
  return data.data.user;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export async function apiGetLeaderboard(page = 1, limit = 20) {
  const data = await apiFetch(`/api/users/leaderboard?page=${page}&limit=${limit}`);
  return data.data;
}

// ─── User stats ───────────────────────────────────────────────────────────────

export async function apiGetUserStats(userId) {
  const data = await apiFetch(`/api/users/${userId}/stats`);
  return data.data;
}

export async function apiCheckHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.ok;
}
