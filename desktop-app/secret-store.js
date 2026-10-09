// A small encrypted store for the few secrets the app window keeps between launches (today: the "remember this
// device" token). Values are encrypted with Electron's safeStorage - on Windows that is DPAPI, so only this Windows
// user on this PC can read them - and kept in <userData>/secrets.json. Only the names in ALLOWED can be asked for,
// so the window can never use this as a general file reader/writer.
const fs = require('fs');
const path = require('path');

const ALLOWED = new Set(['sandveld_remember_token']);

function install({ ipcMain, safeStorage, dir }) {
  const file = path.join(dir, 'secrets.json');
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  };
  const write = (data) => {
    fs.mkdirSync(dir, { recursive: true });
    const partial = `${file}.partial`;
    fs.writeFileSync(partial, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(partial, file);
  };
  const check = (key) => {
    if (!ALLOWED.has(key)) throw new Error('Unknown secret');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Encryption is not available on this PC');
  };

  ipcMain.handle('secret-get', (_event, key) => {
    check(key);
    const stored = read()[key];
    if (!stored) return null;
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    } catch {
      return null; // e.g. copied from another Windows account: unreadable, so treated as not there
    }
  });
  ipcMain.handle('secret-set', (_event, key, value) => {
    check(key);
    if (typeof value !== 'string' || !value || value.length > 500) throw new Error('Not a usable secret');
    write({ ...read(), [key]: safeStorage.encryptString(value).toString('base64') });
    return true;
  });
  ipcMain.handle('secret-remove', (_event, key) => {
    check(key);
    const data = read();
    delete data[key];
    write(data);
    return true;
  });
}

module.exports = { install, ALLOWED };
