import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach stored token on startup
const stored = JSON.parse(localStorage.getItem('auth-store') || '{}');
if (stored?.state?.token) {
  api.defaults.headers.common['Authorization'] = `Bearer ${stored.state.token}`;
}

// Auto-logout on 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth-store');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
