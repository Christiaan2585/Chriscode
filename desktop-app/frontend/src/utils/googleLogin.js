// desktop-app/preload.js exposes exactly this one method via contextBridge -
// the BrowserWindow runs with nodeIntegration disabled and contextIsolation
// enabled (see desktop-app/index.js), so this is the only way the renderer
// can reach the main process's Google sign-in flow at all. Checking for it
// also means this quietly no-ops if the page is ever opened in a plain
// browser tab instead of inside Electron.
export function isElectron() {
  return typeof window !== 'undefined' && typeof window.electronAPI?.googleLogin === 'function';
}

// Opens the system browser to Google's sign-in screen and waits for the
// loopback redirect (handled in the Electron main process). Resolves with
// {code, codeVerifier, redirectUri, nonce} to send straight to
// POST /auth/google/callback.
export async function signInWithGoogle(clientId) {
  if (!isElectron()) {
    throw new Error('Google sign-in is only available in the desktop app.');
  }
  return window.electronAPI.googleLogin(clientId);
}
