// desktop-app/preload.js exposes these via contextBridge - the BrowserWindow
// runs with nodeIntegration disabled and contextIsolation enabled, so this
// is the only way the renderer can reach the main process's auto-updater at
// all. Checking for it also means Settings.jsx quietly shows "not available"
// instead of throwing if it's ever opened outside Electron (a plain browser
// tab during `npm run dev`, or a future web build).
export function isUpdaterAvailable() {
  return typeof window !== 'undefined' && typeof window.electronAPI?.checkForUpdates === 'function';
}

export function checkForUpdates() {
  return window.electronAPI.checkForUpdates();
}

export function quitAndInstall() {
  return window.electronAPI.quitAndInstall();
}

export function getUpdateStatus() {
  return window.electronAPI.getUpdateStatus();
}

// Returns an unsubscribe function, for a React useEffect's cleanup.
export function onUpdateStatus(callback) {
  return window.electronAPI.onUpdateStatus(callback);
}
