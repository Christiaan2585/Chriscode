import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// The access token only ever lives here, in memory - never in localStorage -
// so it disappears the moment the app is closed. That's what makes the
// 5-digit PIN meaningful: reopening the app always needs the PIN, even
// though the "remember this device" token (handled separately, see
// AuthContext) lets you skip straight past the full password/Google form.
let currentAccessToken = null;
let onUnauthorized = null;

export function setAccessToken(token) {
  currentAccessToken = token;
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

apiClient.interceptors.request.use((config) => {
  if (currentAccessToken) {
    config.headers.Authorization = `Bearer ${currentAccessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
