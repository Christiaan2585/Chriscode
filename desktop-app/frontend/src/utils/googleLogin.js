// nodeIntegration is on for this app's BrowserWindow (see desktop-app/index.js),
// which is what makes `require` available as a global in the renderer at all -
// guarding on it also means this quietly no-ops if the page is ever opened in
// a plain browser tab instead of inside Electron.
export function isElectron() {
  return typeof window !== 'undefined' && typeof window.require === 'function';
}

// Opens the system browser to Google's sign-in screen and waits for the
// loopback redirect (handled in the Electron main process). Resolves with
// {code, codeVerifier, redirectUri} to send straight to POST /auth/google/callback.
export async function signInWithGoogle(clientId) {
  if (!isElectron()) {
    throw new Error('Google sign-in is only available in the desktop app.');
  }
  const { ipcRenderer } = window.require('electron');
  return ipcRenderer.invoke('google-oauth-login', { clientId });
}
