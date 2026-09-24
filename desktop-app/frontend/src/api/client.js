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
let notifyError = null;

export function setAccessToken(token) {
  currentAccessToken = token;
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

// Called once from a bridge component inside <ToastProvider> (see
// ToastContext.jsx) so every API call gets automatic, visible error
// reporting with zero changes needed on the page that made the call -
// this is the wiring ToastContext.jsx's own comment always described but
// that never actually existed anywhere, which is why every failed
// save/update/delete across the whole app used to fail completely
// silently (no error, no toast, modal just stays open).
export function setErrorNotifier(handler) {
  notifyError = handler;
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
    } else if (notifyError) {
      const message =
        error.response?.data?.detail ||
        (error.request && !error.response
          ? "Could not reach the backend. Is it running?"
          : "Something went wrong. Please try again.");
      notifyError(typeof message === "string" ? message : "Something went wrong. Please try again.");
    }
    return Promise.reject(error);
  }
);

export default apiClient;
