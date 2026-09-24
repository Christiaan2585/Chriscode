// Folder picker / "show in Explorer", exposed by desktop-app/preload.js.
// Both are absent outside Electron (dev browser tab), so callers check first.
export const canChooseFolder = () => typeof window !== 'undefined' && typeof window.electronAPI?.chooseFolder === 'function';
export const canOpenFolder = () => typeof window !== 'undefined' && typeof window.electronAPI?.openFolder === 'function';

export const chooseFolder = () => window.electronAPI.chooseFolder();
export const openFolder = (path) => window.electronAPI.openFolder(path);
