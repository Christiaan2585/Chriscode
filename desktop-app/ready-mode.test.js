// node --test ready-mode.test.js  (from desktop-app/) - the rules for staying reachable by phones, with fake
// Electron objects: closing the window hides it to the tray instead of quitting, only while it is switched on and
// phones are allowed; quitting really quits; start-with-Windows and keep-awake follow the switches.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readyMode = require('./ready-mode');

function fakes({ packaged = true, phones = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ready-'));
  const log = { tray: [], login: [], blocker: [], notes: [], handlers: {}, hidden: 0, shown: 0 };
  class Tray {
    constructor() { log.tray.push('created'); log.lastTray = this; this.menu = null; this.handlers = {}; }
    setToolTip() {}
    setContextMenu(menu) { this.menu = menu; }
    on(name, fn) { this.handlers[name] = fn; }
    destroy() { log.tray.push('destroyed'); }
  }
  class Notification {
    constructor(opts) { this.opts = opts; }
    show() { log.notes.push(this.opts.body); }
  }
  const ctx = {
    app: { setLoginItemSettings: (s) => log.login.push(s), quit: () => { log.quit = true; } },
    ipcMain: { handle: (name, fn) => { log.handlers[name] = fn; } },
    Tray, Notification,
    Menu: { buildFromTemplate: (t) => t },
    nativeImage: { createFromPath: () => ({}) },
    powerSaveBlocker: { start: (kind) => { log.blocker.push(`start:${kind}`); return 7; }, stop: (id) => log.blocker.push(`stop:${id}`) },
    dir, iconPath: 'icon.ico', isPackaged: packaged,
    phonesEnabled: () => phones,
    showWindow: () => { log.shown += 1; },
    hideWindow: () => { log.hidden += 1; },
  };
  return { ctx, log, dir };
}

test('by default nothing changes: closing the window quits as before', () => {
  const { ctx } = fakes();
  const ready = readyMode.install(ctx);
  assert.equal(ready.shouldHideOnClose(), false);
});

test('switched on and phones allowed: closing hides to the tray, with a one-time hint', () => {
  const { ctx, log } = fakes();
  const ready = readyMode.install(ctx);
  log.handlers['ready-mode-set']({}, { keepRunning: true });
  assert.equal(ready.shouldHideOnClose(), true);
  ready.hideToTray();
  assert.equal(log.hidden, 1);
  assert.equal(log.tray.filter((t) => t === 'created').length, 1);
  assert.equal(log.notes.length, 1);
  ready.hideToTray();
  assert.equal(log.notes.length, 1, 'the hint is only shown once');
});

test('with phones switched off, closing still quits even if the switch is on', () => {
  const { ctx, log } = fakes({ phones: false });
  const ready = readyMode.install(ctx);
  log.handlers['ready-mode-set']({}, { keepRunning: true });
  assert.equal(ready.shouldHideOnClose(), false);
});

test('quitting for real is never blocked', () => {
  const { ctx, log } = fakes();
  const ready = readyMode.install(ctx);
  log.handlers['ready-mode-set']({}, { keepRunning: true });
  ready.noteQuitting();
  assert.equal(ready.shouldHideOnClose(), false);
});

test('the tray menu opens the window and quits completely, and a double-click opens it too', () => {
  const { ctx, log } = fakes();
  const ready = readyMode.install(ctx);
  log.handlers['ready-mode-set']({}, { keepRunning: true });
  ready.hideToTray();
  const [open, separator, quit] = log.lastTray.menu;
  assert.equal(separator.type, 'separator');
  open.click();
  assert.equal(log.shown, 1);
  log.lastTray.handlers['double-click']();
  assert.equal(log.shown, 2);
  quit.click();
  assert.equal(log.quit, true);
});

test('start with Windows registers a hidden start, but only in an installed app', () => {
  const installed = fakes({ packaged: true });
  const ready = readyMode.install(installed.ctx);
  installed.log.handlers['ready-mode-set']({}, { startWithWindows: true });
  assert.deepEqual(installed.log.login.at(-1), { openAtLogin: true, args: ['--hidden'] });
  installed.log.handlers['ready-mode-set']({}, { startWithWindows: false });
  assert.deepEqual(installed.log.login.at(-1), { openAtLogin: false, args: [] });
  assert.ok(ready);

  const dev = fakes({ packaged: false });
  readyMode.install(dev.ctx);
  dev.log.handlers['ready-mode-set']({}, { startWithWindows: true });
  assert.equal(dev.log.login.length, 0, 'never registers the development Electron');
});

test('a hidden start only happens when it was asked for and start-with-Windows is on', () => {
  const { ctx, log } = fakes();
  const ready = readyMode.install(ctx);
  assert.equal(ready.startedHidden(['app.exe', '--hidden']), false);
  log.handlers['ready-mode-set']({}, { startWithWindows: true });
  assert.equal(ready.startedHidden(['app.exe', '--hidden']), true);
  assert.equal(ready.startedHidden(['app.exe']), false);
});

test('keeping the PC awake starts and stops the blocker once', () => {
  const { ctx, log } = fakes();
  const ready = readyMode.install(ctx);
  log.handlers['ready-mode-set']({}, { preventSleep: true });
  log.handlers['ready-mode-set']({}, { preventSleep: true });
  assert.deepEqual(log.blocker, ['start:prevent-app-suspension']);
  log.handlers['ready-mode-set']({}, { preventSleep: false });
  assert.deepEqual(log.blocker, ['start:prevent-app-suspension', 'stop:7']);
  assert.ok(ready);
});

test('the choices are remembered and junk is ignored', () => {
  const { ctx, log, dir } = fakes();
  readyMode.install(ctx);
  const saved = log.handlers['ready-mode-set']({}, { keepRunning: true, preventSleep: 'yes', evil: true });
  assert.equal(saved.keepRunning, true);
  assert.equal(saved.preventSleep, false);
  assert.equal('evil' in saved, false);
  const again = fakes();
  again.ctx.dir = dir;
  readyMode.install(again.ctx);
  assert.equal(again.log.handlers['ready-mode-get']().keepRunning, true);
});

test('the settings screen is told whether this is an installed app and whether phones are allowed', () => {
  const { ctx, log } = fakes({ packaged: false, phones: false });
  readyMode.install(ctx);
  const got = log.handlers['ready-mode-get']();
  assert.equal(got.canAutostart, false);
  assert.equal(got.phonesAllowed, false);
});
