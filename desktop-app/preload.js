const { contextBridge, ipcRenderer } = require('electron');

// This is the ONLY thing the renderer (the React app) gets exposed to it -
// no require('electron'), no Node globals, no filesystem/process access.
// That's what lets the BrowserWindow run with nodeIntegration disabled and
// contextIsolation enabled (Electron's own recommended, secure default):
// even if a bad frontend dependency or an XSS bug ever ran arbitrary script
// in the renderer, the most it could reach is this one whitelisted call.
contextBridge.exposeInMainWorld('electronAPI', {
  googleLogin: (clientId) => ipcRenderer.invoke('google-oauth-login', { clientId }),

  // Settings.jsx's "Software Update" section. checkForUpdates()/
  // quitAndInstall() are fire-and-forget - the actual status arrives via
  // onUpdateStatus, which returns an unsubscribe function so a React
  // useEffect can clean up its listener on unmount.
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
});
