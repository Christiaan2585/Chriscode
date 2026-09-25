// Runs electron-builder for the Windows NSIS installer.
//
// Why not plain `electron-builder build --win`: to produce the uninstaller,
// electron-builder builds a temporary unsigned installer and *runs* it.
// Windows Smart App Control (on for this dev PC) blocks that, and the build
// dies with a bare "spawn UNKNOWN". electron-builder already has a path that
// extracts the uninstaller from that file without running it (its
// UninstallerReader, normally used on macOS); this switches it on. The
// override only affects that one branch - it's the flag's only caller.
const builder = require("electron-builder");
const macosVersion = require("app-builder-lib/out/util/macosVersion");

macosVersion.isMacOsCatalina = () => true;

builder
  .build({ win: ["nsis"], publish: process.argv.includes("--publish") ? "always" : "never" })
  .then((files) => console.log("Built:\n  " + files.join("\n  ")))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
