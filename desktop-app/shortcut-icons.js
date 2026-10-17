// The app's .exe is the stock, unmodified Electron program (editing it made Windows Smart App Control refuse every new
// build - see CLAUDE.md "The backend is a signed Python"), so shortcuts to it would show Electron's default icon. Windows lets
// a shortcut carry its own icon: on each start the app points its own shortcuts (desktop, Start menu, pinned to the taskbar)
// at resources/icon.ico. Only shortcuts that really start THIS exe are touched, and only their icon.

function fixShortcutIcons({ shell, fs, path, execPath, iconPath, folders, name = 'Sandveld Vee Dienste.lnk', log = () => {} }) {
  if (!fs.existsSync(iconPath)) return 0;
  const samePath = (a, b) => path.resolve(a || '').toLowerCase() === path.resolve(b || '').toLowerCase();
  let updated = 0;
  for (const folder of folders) {
    const file = path.join(folder, name);
    try {
      if (!fs.existsSync(file)) continue;
      const current = shell.readShortcutLink(file);
      if (!samePath(current.target, execPath)) continue; // not ours (e.g. someone's own shortcut with that name)
      if (samePath(current.icon, iconPath) && !current.iconIndex) continue; // already right
      shell.writeShortcutLink(file, 'update', { icon: iconPath, iconIndex: 0 });
      updated += 1;
    } catch (err) {
      log(`[shortcuts] could not update ${file}: ${err.message}`);
    }
  }
  return updated;
}

module.exports = { fixShortcutIcons };
