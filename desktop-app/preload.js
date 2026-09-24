const { contextBridge, ipcRenderer } = require('electron');

// This is the ONLY thing the renderer (the React app) gets exposed to it -
// no require('electron'), no Node globals, no filesystem/process access.
// That's what lets the BrowserWindow run with nodeIntegration disabled and
// contextIsolation enabled (Electron's own recommended, secure default):
// even if a bad frontend dependency or an XSS bug ever ran arbitrary script
// in the renderer, the most it could reach is this one whitelisted call.
contextBridge.exposeInMainWorld('electronAPI', {
  googleLogin: (clientId) => ipcRenderer.invoke('google-oauth-login', { clientId }),
});
