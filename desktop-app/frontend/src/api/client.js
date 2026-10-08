import axios from 'axios';
import { nativeAdapter } from './nativeHttp';

// VITE_API_URL: dev only, e.g. a test backend on another port while the installed app holds 8000.
const LOCAL_BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: LOCAL_BACKEND,
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

// Android only: once paired, API calls go to the office PC's LAN address
// instead of the (nonexistent, on a phone) localhost backend. See
// utils/pairing.js - the certificate trust for this connection is pinned
// natively, not here; this just points axios at it and attaches the
// device token every other platform never needs.
export function setDeviceConnection(pairing) {
  if (pairing?.host) {
    apiClient.defaults.baseURL = `https://${pairing.host}:${pairing.port}`;
    apiClient.defaults.headers.common['X-Device-Token'] = pairing.token;
    apiClient.defaults.adapter = nativeAdapter; // the WebView would refuse the PC's self-signed certificate
  } else {
    apiClient.defaults.adapter = axios.defaults.adapter;
    apiClient.defaults.baseURL = LOCAL_BACKEND;
    delete apiClient.defaults.headers.common['X-Device-Token'];
  }
}

// What to say when nothing answers: a phone talks to the office PC, the desktop app to its own backend.
export function unreachableMessage() {
  return apiClient.defaults.adapter === nativeAdapter
    ? "Could not reach the office PC. Is the Sandveld app open on it, and is this phone on the office Wi-Fi?"
    : "Could not reach the backend. Is it running?";
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
    // Calls marked `queueable` (see utils/outbox.js) are handled by the
    // caller itself when the PC is unreachable or the session needs a
    // fresh sign-in - that's expected there, not a toast-worthy error.
    const quietly = error.config?.queueable && (!error.response || error.response.status === 401);
    if (quietly) return Promise.reject(error);
    // Calls marked `silent` (bulk deletes) report a refusal themselves, next to the record it was about.
    if (error.config?.silent && error.response && error.response.status !== 401) return Promise.reject(error);
    if (error.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    } else if (notifyError) {
      const message =
        error.response?.data?.detail ||
        (error.request && !error.response
          ? unreachableMessage()
          : "Something went wrong. Please try again.");
      notifyError(typeof message === "string" ? message : "Something went wrong. Please try again.");
    }
    return Promise.reject(error);
  }
);

export default apiClient;
