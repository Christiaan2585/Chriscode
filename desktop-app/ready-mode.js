// "Always ready for phones": the phone app talks to the backend that lives inside this desktop app, so a closed
// window, a PC that starts without anybody signing in, or a PC that falls asleep all look like "can't connect" on
// the phone. Three switches (Settings -> Phones), all off until someone turns them on:
//   keepRunning      - closing the window hides it to the system tray instead of quitting (only while phones are allowed)
//   startWithWindows - starts hidden in the tray when Windows starts (installed app only)
//   preventSleep     - the PC is not allowed to go to sleep while the app runs (the screen can still switch off)
// Electron objects are handed in, so the rules can be tested without a window (ready-mode.test.js).
const fs = require('fs');
const path = require('path');

const KEYS = ['keepRunning', 'startWithWindows', 'preventSleep'];

const normalise = (raw = {}) => Object.fromEntries(KEYS.map((k) => [k, raw[k] === true]));

function install({ app, ipcMain, Tray, Menu, nativeImage, powerSaveBlocker, Notification, dir, iconPath, isPackaged,
  phonesEnabled, showWindow, hideWindow }) {
  const file = path.join(dir, 'ready-mode.json');
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  };
  let stored = read();
  let settings = normalise(stored);
  let hintShown = stored.hintShown === true;
  let tray = null;
  let blocker = null;
  let quitting = false;

  const persist = () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.partial`, JSON.stringify({ ...settings, hintShown }), { mode: 0o600 });
    fs.renameSync(`${file}.partial`, file);
  };

  const ensureTray = () => {
    if (tray) return;
    tray = new Tray(nativeImage.createFromPath(iconPath));
    tray.setToolTip('Sandveld Vee Dienste - running, ready for phones');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Sandveld Vee Dienste', click: showWindow },
      { type: 'separator' },
      { label: 'Quit completely (phones cannot connect)', click: () => app.quit() },
    ]));
    tray.on('double-click', showWindow);
  };

  const apply = () => {
    if (isPackaged) app.setLoginItemSettings({ openAtLogin: settings.startWithWindows, args: settings.startWithWindows ? ['--hidden'] : [] });
    if (settings.preventSleep && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
    if (!settings.preventSleep && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
    if (!settings.keepRunning && !settings.startWithWindows && tray) { tray.destroy(); tray = null; }
  };

  const describe = () => ({ ...settings, phonesAllowed: Boolean(phonesEnabled()), canAutostart: Boolean(isPackaged) });

  ipcMain.handle('ready-mode-get', () => describe());
  ipcMain.handle('ready-mode-set', (_event, change) => {
    const next = { ...settings };
    for (const key of KEYS) if (change && typeof change[key] === 'boolean') next[key] = change[key];
    settings = next;
    persist();
    apply();
    return describe();
  });
  apply();

  return {
    shouldHideOnClose: () => !quitting && settings.keepRunning && Boolean(phonesEnabled()),
    hideToTray() {
      ensureTray();
      hideWindow();
      if (!hintShown) { // once: so nobody thinks the app crashed or that it is gone
        hintShown = true;
        persist();
        new Notification({
          title: 'Sandveld Vee Dienste is still running',
          body: 'It stays in the background so phones can connect. Click the icon near the clock to open it, or right-click it to quit.',
        }).show();
      }
    },
    noteQuitting() { quitting = true; },
    startedHidden(argv) {
      const hidden = Array.isArray(argv) && argv.includes('--hidden') && settings.startWithWindows;
      if (hidden) ensureTray();
      return hidden;
    },
  };
}

module.exports = { install, normalise, KEYS };
