const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { fixShortcutIcons } = require('./shortcut-icons');

const EXE = 'C:\\Apps\\Sandveld\\Sandveld Vee Dienste.exe';
const ICON = 'C:\\Apps\\Sandveld\\resources\\icon.ico';

const world = (links, iconExists = true) => {
  const written = [];
  const fs = { existsSync: (p) => (p === ICON ? iconExists : p in links) };
  const shell = {
    readShortcutLink: (p) => links[p],
    writeShortcutLink: (p, op, props) => { written.push([p, op, props]); },
  };
  return { fs, shell, written };
};
const folders = ['C:\\Desktop', 'C:\\Start', 'C:\\Pinned'];
const NAME = 'Sandveld Vee Dienste.lnk';
const at = (f) => path.join(f, NAME);

test('our shortcuts get the app icon, nothing else about them changes', () => {
  const links = { [at(folders[0])]: { target: EXE, icon: EXE }, [at(folders[1])]: { target: EXE.toUpperCase(), icon: '' } };
  const { fs, shell, written } = world(links);
  const count = fixShortcutIcons({ shell, fs, path, execPath: EXE, iconPath: ICON, folders });
  assert.equal(count, 2);
  assert.deepEqual(written.map(([p, op, props]) => [p, op, props]), [
    [at(folders[0]), 'update', { icon: ICON, iconIndex: 0 }],
    [at(folders[1]), 'update', { icon: ICON, iconIndex: 0 }],
  ]);
});

test('a shortcut that already has the icon is left alone', () => {
  const { fs, shell, written } = world({ [at(folders[0])]: { target: EXE, icon: ICON, iconIndex: 0 } });
  assert.equal(fixShortcutIcons({ shell, fs, path, execPath: EXE, iconPath: ICON, folders }), 0);
  assert.equal(written.length, 0);
});

test('a shortcut to something else with the same name is never touched', () => {
  const { fs, shell, written } = world({ [at(folders[0])]: { target: 'C:\\Other\\app.exe', icon: '' } });
  assert.equal(fixShortcutIcons({ shell, fs, path, execPath: EXE, iconPath: ICON, folders }), 0);
  assert.equal(written.length, 0);
});

test('no icon file, no change; one unreadable shortcut does not stop the others', () => {
  const links = { [at(folders[0])]: { target: EXE, icon: '' } };
  const none = world(links, false);
  assert.equal(fixShortcutIcons({ shell: none.shell, fs: none.fs, path, execPath: EXE, iconPath: ICON, folders }), 0);

  const logs = [];
  const broken = world({ [at(folders[0])]: { target: EXE, icon: '' }, [at(folders[1])]: { target: EXE, icon: '' } });
  const original = broken.shell.writeShortcutLink;
  broken.shell.writeShortcutLink = (p, ...rest) => { if (p === at(folders[0])) throw new Error('locked'); return original(p, ...rest); };
  const count = fixShortcutIcons({ shell: broken.shell, fs: broken.fs, path, execPath: EXE, iconPath: ICON, folders, log: (m) => logs.push(m) });
  assert.equal(count, 1);
  assert.match(logs[0], /locked/);
});
