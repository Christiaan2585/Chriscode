import apiClient from './client';

export const authService = {
  status: async () => (await apiClient.get('/auth/status')).data,
  setupFirstAccount: async (data) => (await apiClient.post('/auth/setup', data)).data,
  login: async (email, password, code) =>
    (await apiClient.post('/auth/login', { email, password, code: code || null }, { silent: true })).data,
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
  changePassword: async (current_password, new_password) =>
    (await apiClient.put('/auth/me/password', { current_password, new_password })).data,
  signOutEverywhere: async () => (await apiClient.post('/auth/sign-out-everywhere')).data,
  twoStepSetup: async () => (await apiClient.post('/auth/2fa/setup')).data,
  twoStepEnable: async (code) => (await apiClient.post('/auth/2fa/enable', { code })).data,
  twoStepDisable: async (password, code) => (await apiClient.post('/auth/2fa/disable', { password, code })).data,
  resetPassword: async (id, new_password) => (await apiClient.post(`/auth/users/${id}/reset-password`, { new_password })).data,
  unlockUser: async (id) => (await apiClient.post(`/auth/users/${id}/unlock`)).data,
  signOutUser: async (id) => (await apiClient.post(`/auth/users/${id}/sign-out`)).data,
  resetTwoStep: async (id) => (await apiClient.post(`/auth/users/${id}/two-step/reset`)).data,
};
