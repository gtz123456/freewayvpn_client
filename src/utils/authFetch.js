import { fetch } from '@tauri-apps/plugin-http';

const LOGIN_SERVER = 'http://146.235.210.34:8001';

let isRefreshing = false;
let refreshPromise = null;

/**
 * Try to re-login with stored credentials and return new token.
 * Returns null if re-login fails.
 */
async function tryReLogin() {
  const email = localStorage.getItem('auth_email');
  const password = localStorage.getItem('auth_password');

  if (!email || !password) return null;

  try {
    const res = await fetch(`${LOGIN_SERVER}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Email: email, Password: password }),
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      return data.token;
    }
  } catch (e) {
    console.error('Auto re-login failed:', e);
  }
  return null;
}

/**
 * Authenticated fetch wrapper.
 * - Automatically attaches Authorization header.
 * - On 401, tries to re-login once, then retries the request.
 * - If re-login fails, clears token and redirects to login page.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
export async function authFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers, Authorization: token };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Prevent multiple concurrent re-login attempts
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = tryReLogin().finally(() => {
        isRefreshing = false;
      });
    }

    const newToken = await refreshPromise;

    if (newToken) {
      // Retry the original request with new token
      return fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: newToken },
      });
    } else {
      // Re-login failed, clear credentials and redirect
      localStorage.removeItem('token');
      localStorage.removeItem('auth_email');
      localStorage.removeItem('auth_password');
      window.location.href = '/';
      throw new Error('Session expired. Please login again.');
    }
  }

  return response;
}
