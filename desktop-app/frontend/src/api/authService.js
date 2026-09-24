import apiClient from './client';

export const authService = {
  status: async () => (await apiClient.get('/auth/status')).data,
  setupFirstAccount: async (data) => (await apiClient.post('/auth/setup', data)).data,
  login: async (email, password) => (await apiClient.post('/auth/login', { email, password })).data,
  googleCallback: async (code, codeVerifier, redirectUri, nonce) =>
    (await apiClient.post('/auth/google/callback', { code, code_verifier: codeVerifier, redirect_uri: redirectUri, nonce })).data,
  setupPin: async (pin) => (await apiClient.post('/auth/pin/setup', { pin })).data,
  verifyPin: async (rememberToken, pin) =>
    (await apiClient.post('/auth/pin/verify', { remember_token: rememberToken, pin })).data,
  forgetDevice: async (rememberToken) =>
    (await apiClient.post('/auth/forget-device', { remember_token: rememberToken })).data,
  me: async () => (await apiClient.get('/auth/me')).data,
  listUsers: async () => (await apiClient.get('/auth/users')).data,
  addUser: async (data) => (await apiClient.post('/auth/users', data)).data,
  deactivateUser: async (id) => (await apiClient.delete(`/auth/users/${id}`)).data,
};
