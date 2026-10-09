const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const localSecret = require('./local-secret');
const { autoUpdater } = require('electron-updater');

// Not using the `electron-is-dev` package: its current release is ESM-only
// (`export default`), and requiring an ESM package from CommonJS like this
// doesn't unwrap the default export - `require('electron-is-dev')` returns
// the whole module namespace object ({ __esModule: true, default: false }),
// which is a truthy OBJECT, not the boolean it looks like. That silently
// made `isDev` true in EVERY build, packaged or not - so the packaged app
// was always trying to load the dev server at http://localhost:5173 instead
// of its own bundled files, showing a blank window on any machine that
// didn't happen to have `npm run dev` running. `app.isPackaged` is exactly
// what that package computes internally anyway when no env var override is
// set, so using it directly here is both simpler and actually correct.
const isDev = !app.isPackaged;

// Sets the folder name Electron's app.getPath('userData') resolves to
// (otherwise it falls back to package.json's "name", i.e. the kebab-case
// "sandveld-vee-dienste"). Must run before any app.getPath() call below.
app.setName('Sandveld Vee Dienste');

const BACKEND_HOST = '127.0.0.1';
// Proves to the backend that requests come from this app's own window (see local-secret.js).
const LOCAL_SECRET = localSecret.createSecret();
const BACKEND_PORT = 8000;

// Dev mode (`npm run dev` / `electron .`): this file lives in `desktop-app/`,
// so the project root (where `app/`, `venv/` and `kyron_agri.db` live) is one
// level up - that resolves correctly no matter where the project folder is on
// disk. The backend runs straight out of this project's own venv, exactly as
// before - nothing about dev mode changes here.
const PROJECT_ROOT = process.env.SANDVELD_PROJECT_ROOT || path.join(__dirname, '..');

const PYTHON_BIN = process.platform === 'win32'
  ? path.join(PROJECT_ROOT, 'venv', 'Scripts', 'python.exe')
  : path.join(PROJECT_ROOT, 'venv', 'bin', 'python');

// Packaged build (`npm run package` / the installed app): the Python backend
// ships as a standalone PyInstaller executable bundled via electron-builder's
// "extraResources" (see package.json) into <install dir>/resources/backend/.
// That means the installed app needs no Python on the target PC at all, so it
// runs on any Windows machine, not just the one it was built on.
const PACKAGED_BACKEND_EXE = path.join(
  process.resourcesPath || '',
  'backend',
  'sandveld-backend',
  process.platform === 'win32' ? 'sandveld-backend.exe' : 'sandveld-backend'
);

// Writable, per-user, per-install data folder for the packaged app's live
// database and Google OAuth config (Electron's standard userData path, e.g.
// %APPDATA%\Sandveld Vee Dienste on Windows). The app's own install folder
// can be read-only and gets replaced on every update, so live data can never
// live there. Dev mode never sets SANDVELD_DATA_DIR, so it keeps using
// ./kyron_agri.db and ./config/google_oauth.json next to the project exactly
// as before - that's where this PC's existing data already lives.
const PACKAGED_DATA_DIR = app.getPath('userData');

// Packaged mode has no visible console - a client running the installed app
// has no terminal to read "Failed to start the backend" from. Everything the
// backend (and Electron's own launch of it) says gets written here too, so a
// failure on someone else's PC leaves an actual trail to look at instead of
// just a blank or broken window with no explanation. Dev mode is unaffected -
// its console is already visible in the terminal running `npm run dev`.
let backendLogStream = null;
function logToBackendFile(line) {
  if (!backendLogStream) return;
  backendLogStream.write(`[${new Date().toISOString()}] ${line}\n`);
}

let backendProcess = null;
let mainWindow = null;

function isBackendUp() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: BACKEND_HOST, port: BACKEND_PORT, path: '/', timeout: 1500 },
      (res) => {
        res.destroy();
        resolve(true);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForBackend(maxWaitMs = 20000, intervalMs = 400) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const check = async () => {
      if (await isBackendUp()) return resolve(true);
      if (Date.now() - startedAt > maxWaitMs) return resolve(false);
      setTimeout(check, intervalMs);
    };
    check();
  });
}

// A backend left running by an earlier launch (a crash, a killed app) doesn't
// know this launch's secret. In the installed app it is ours to stop; in
// development it is someone's own server, so just say so.
async function stopOrphanBackend() {
  await new Promise((resolve) => execFile('taskkill', ['/IM', 'sandveld-backend.exe', '/F'], () => resolve()));
  for (let i = 0; i < 20 && (await isBackendUp()); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

async function startBackend() {
  if (await isBackendUp()) {
    const state = await localSecret.checkBackend(BACKEND_HOST, BACKEND_PORT, LOCAL_SECRET);
    if (state === 'ok') {
      console.log(`Backend already running on port ${BACKEND_PORT} - reusing it.`);
      return;
    }
    if (!app.isPackaged) {
      dialog.showErrorBox('Sandveld Vee Dienste', `Something else is already running on port ${BACKEND_PORT} and won't accept this app. Stop it and start the app again.`);
      return;
    }
    logToBackendFile('An older backend was still running; stopping it so this launch can start its own.');
    await stopOrphanBackend();
  }

  if (app.isPackaged) {
    // Packaged mode: run the bundled standalone backend executable. No
    // Python installation is required on this machine at all.
    fs.mkdirSync(PACKAGED_DATA_DIR, { recursive: true });
    try {
      backendLogStream = fs.createWriteStream(path.join(PACKAGED_DATA_DIR, 'backend.log'), { flags: 'a' });
    } catch (err) {
      console.error('Could not open backend.log for writing:', err.message);
    }
    logToBackendFile(`--- Sandveld Vee Dienste starting (data dir: ${PACKAGED_DATA_DIR}) ---`);

    if (!fs.existsSync(PACKAGED_BACKEND_EXE)) {
      const msg = `Bundled backend executable not found at: ${PACKAGED_BACKEND_EXE}\n` +
        'This build was not packaged correctly - the PyInstaller backend build step ' +
        '(see desktop-app/build_and_package.bat) must run before electron-builder.';
      console.error(msg);
      logToBackendFile(msg);
      dialog.showErrorBox(
        'Sandveld Vee Dienste - backend missing',
        'The app could not find its backend component and cannot start.\n\n' +
        `Expected it at:\n${PACKAGED_BACKEND_EXE}\n\n` +
        'This usually means the installer was built incorrectly. Please reinstall, or contact support.'
      );
      return;
    }

    console.log(`Starting bundled backend: ${PACKAGED_BACKEND_EXE}`);
    console.log(`Data directory: ${PACKAGED_DATA_DIR}`);
    spawnPackagedBackend(1);
    return;
  } else {
    // Dev mode: unchanged - run straight out of this project's own venv.
    console.log(`Starting backend from ${PROJECT_ROOT} using ${PYTHON_BIN}`);
    backendProcess = spawn(
      PYTHON_BIN,
      ['-m', 'uvicorn', 'app.main:app', '--host', BACKEND_HOST, '--port', String(BACKEND_PORT)],
      { cwd: PROJECT_ROOT, windowsHide: true, env: { ...process.env, SANDVELD_LOCAL_SECRET: LOCAL_SECRET } }
    );

    backendProcess.on('error', (err) => {
      console.error('Failed to start the backend automatically:', err.message);
      console.error(`Expected a Python virtual environment at: ${PYTHON_BIN}`);
    });
  }

  pipeBackendOutput();
}

function pipeBackendOutput() {
  backendProcess.stdout?.on('data', (data) => {
    const line = `${data}`.trim();
    console.log(`[backend] ${line}`);
    logToBackendFile(line);
  });
  backendProcess.stderr?.on('data', (data) => {
    const line = `${data}`.trim();
    console.error(`[backend] ${line}`);
    logToBackendFile(line);
  });
}

// Windows Smart App Control can refuse the first launch of a newly updated,
// unsigned backend exe and allow it moments later, once it has checked the
// file (seen on the dev PC on 2026-09-28). So a failed start is retried a
// couple of times before the user is shown an error.
const BACKEND_START_ATTEMPTS = 3;
const BACKEND_RETRY_DELAY_MS = 2500;

function spawnPackagedBackend(attempt) {
  let failed = false; // 'error' and 'exit' can both fire for one failed start
  const retryOrReport = (reason) => {
    if (failed) return;
    failed = true;
    logToBackendFile(`Backend start attempt ${attempt} failed: ${reason}`);
    if (attempt < BACKEND_START_ATTEMPTS) {
      setTimeout(() => spawnPackagedBackend(attempt + 1), BACKEND_RETRY_DELAY_MS);
      return;
    }
    dialog.showErrorBox(
      'Sandveld Vee Dienste - backend failed to start',
      `Failed to start the bundled backend: ${reason}\n\n` +
      `A log file may have more detail at:\n${path.join(PACKAGED_DATA_DIR, 'backend.log')}`
    );
  };

  const startedAt = Date.now();
  backendProcess = spawn(
    PACKAGED_BACKEND_EXE,
    [],
    {
      cwd: PACKAGED_DATA_DIR,
      windowsHide: true,
      env: {
        ...process.env,
        SANDVELD_DATA_DIR: PACKAGED_DATA_DIR,
        SANDVELD_BACKEND_HOST: BACKEND_HOST,
        SANDVELD_BACKEND_PORT: String(BACKEND_PORT),
        SANDVELD_LOCAL_SECRET: LOCAL_SECRET,
      },
    }
  );
  backendProcess.on('error', (err) => retryOrReport(err.message));
  backendProcess.on('exit', (code, signal) => {
    if (code === 0 || code === null) return;
    logToBackendFile(`Backend exited unexpectedly (code=${code}, signal=${signal})`);
    // Dying straight away is a failed start (blocked, or crashed on launch);
    // dying later is a crash while running, which a retry here won't fix.
    if (Date.now() - startedAt < 15000) retryOrReport(`exited with code ${code}`);
  });
  pipeBackendOutput();
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  backendProcess = null;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Sandveld Vee Dienste',
    // A packaged build already gets its icon from the exe itself (package.json's
    // build.win.icon); this is what makes the window/taskbar icon correct when
    // just running `npm run dev` too, instead of Electron's default icon.
    icon: path.join(__dirname, 'build', 'icon.ico'),
  });

  await startBackend();
  // Longer when packaged: allows for spawnPackagedBackend's retries.
  const backendReady = await waitForBackend(app.isPackaged ? 30000 : 20000);
  if (!backendReady) {
    const msg = `Backend did not respond on http://${BACKEND_HOST}:${BACKEND_PORT} within the timeout. ` +
      'Loading the UI anyway - API calls will fail until the backend is reachable.';
    console.error(msg);
    logToBackendFile(msg);
    if (app.isPackaged) {
      dialog.showErrorBox(
        'Sandveld Vee Dienste - backend not responding',
        'The app is taking longer than expected to start, or the backend crashed on launch.\n\n' +
        'The app will still open, but data will not load until the backend is reachable.\n\n' +
        `A log file may have more detail at:\n${path.join(PACKAGED_DATA_DIR, 'backend.log')}`
      );
    }
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Point exactly to the production build folder relative to index.js
    const indexPath = path.join(__dirname, 'frontend', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // The window only ever shows this app. A link or window.open must never make
  // it load someone else's page - such a page would inherit the preload bridge
  // (window.electronAPI) - so navigation away is refused and new windows are
  // never made: ordinary web links go to the user's own browser instead.
  // Exactly this app's own page (a #/route change inside it is not a navigation): the dev server in dev mode,
  // the one bundled index.html when packaged - never "any file://", which would let a link open a local file.
  const appPage = isDev ? 'http://localhost:5173/' : pathToFileURL(path.join(__dirname, 'frontend', 'dist', 'index.html')).href;
  const isAppPage = (url) => {
    const bare = url.split('#')[0];
    return isDev ? bare.startsWith(appPage) : bare === appPage;
  };
  const refuse = (event, url) => { if (!isAppPage(url)) event.preventDefault(); };
  mainWindow.webContents.on('will-navigate', refuse);
  mainWindow.webContents.on('will-redirect', refuse);
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https:|mailto:)/i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  // A "black, frozen window" can come from the renderer process itself
  // crashing or hanging (a GPU/driver hiccup, an out-of-memory spike from a
  // very large table render, etc.) rather than from a normal JS exception -
  // that kind of failure happens below the page's own code, so a React
  // error boundary can't catch it. These log what happened (visible in the
  // terminal running `npm run dev`) and automatically reload the window
  // instead of leaving it stuck forever.
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error(`[renderer] process gone: reason=${details.reason} exitCode=${details.exitCode}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.error('[renderer] window became unresponsive (frozen) - waiting to see if it recovers...');
  });

  mainWindow.webContents.on('responsive', () => {
    console.log('[renderer] window is responsive again.');
  });

  setupAutoUpdater();
}

// Checks GitHub Releases (see package.json's build.publish config) for a
// newer version, downloads it in the background, and prompts to restart once
// it's ready. Only meaningful for a packaged install - a dev run has no
// installed version to update, so app.isPackaged short-circuits it there
// rather than have electron-updater fail looking for app-update.yml that a
// dev build never produces.
//
// Runs automatically on launch and every few hours after that (so an
// install that's left open for days still catches new releases), but is
// also exposed to the renderer (see the IPC handlers below and
// Settings.jsx's "Software Update" section) as a manual "Check for
// Updates" button - the previous version of this only logged to
// backend.log and showed one native dialog once a download finished, which
// meant there was no way to ask "is there an update?" on demand, and no
// on-screen feedback at all while a check/download was in progress.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

// Current status, pushed to the renderer on every change and also readable
// on demand (get-update-status) for a Settings page that mounts after the
// last change already happened.
let updateStatus = { state: 'idle' };

function setUpdateStatus(next) {
  updateStatus = next;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    logToBackendFile('[updater] checking for update...');
    setUpdateStatus({ state: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    logToBackendFile(`[updater] update available: v${info.version} - downloading...`);
    setUpdateStatus({ state: 'downloading', version: info.version, percent: 0 });
  });
  autoUpdater.on('update-not-available', () => {
    logToBackendFile('[updater] already on the latest version.');
    setUpdateStatus({ state: 'up-to-date' });
  });
  autoUpdater.on('error', (err) => {
    logToBackendFile(`[updater] check/download failed: ${err.message}`);
    setUpdateStatus({ state: 'error', message: err.message });
  });
  autoUpdater.on('download-progress', (progress) => {
    logToBackendFile(`[updater] downloading update: ${Math.round(progress.percent)}%`);
    setUpdateStatus({ ...updateStatus, state: 'downloading', percent: Math.round(progress.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    logToBackendFile(`[updater] update downloaded: v${info.version}`);
    setUpdateStatus({ state: 'downloaded', version: info.version });
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Sandveld Vee Dienste ${info.version} has been downloaded.`,
      detail: 'Restart now to apply it, or it will install automatically the next time you close the app.',
    }).then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
  });

  const runCheck = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      logToBackendFile(`[updater] check failed: ${err.message}`);
      setUpdateStatus({ state: 'error', message: err.message });
    });
  };

  runCheck();
  setInterval(runCheck, UPDATE_CHECK_INTERVAL_MS);
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Renderer-triggered counterparts to the automatic checks in
// setupAutoUpdater() - see Settings.jsx's "Software Update" section. All
// three no-op with an explanatory status in dev mode (app.isPackaged is
// false, so setupAutoUpdater() itself never ran and updateStatus is still
// its default {state: 'idle'}) rather than throwing, since a dev run has no
// installed version to update in the first place.
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    setUpdateStatus({ state: 'error', message: 'Updates are only available in the installed app, not in development mode.' });
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => {
    setUpdateStatus({ state: 'error', message: err.message });
  });
});

ipcMain.handle('quit-and-install', async () => {
  if (updateStatus.state === 'downloaded') autoUpdater.quitAndInstall();
});

ipcMain.handle('get-update-status', () => updateStatus);

// Settings -> Backups: pick an extra backup folder (OneDrive, USB drive...)
// and open the backups folder in Explorer.
ipcMain.handle('choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a folder for backup copies',
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Sending a catalogue / order form to a client: WhatsApp and email can't be
// handed a file by another program, so the PDF is saved into Documents\
// Sandveld Vee Dienste\Sent to clients and shown selected in Explorer, ready
// to drag into the chat or email. PDFs only, a plain file name, at most 60 MB.
const MAX_SEND_BYTES = 60 * 1024 * 1024;
ipcMain.handle('save-for-sending', async (_event, { name, data }) => {
  const safe = path.basename(String(name || '')).replace(/[^\w .,()'&-]+/g, '').trim().slice(0, 120);
  if (!safe.toLowerCase().endsWith('.pdf') || !(data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
    return { error: 'Only PDF files can be saved for sending' };
  }
  const bytes = Buffer.from(data instanceof ArrayBuffer ? data : data.buffer);
  if (bytes.length > MAX_SEND_BYTES || bytes.subarray(0, 4).toString() !== '%PDF') {
    return { error: 'That file is not a PDF this app made' };
  }
  const folder = path.join(app.getPath('documents'), 'Sandveld Vee Dienste', 'Sent to clients');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, safe);
  fs.writeFileSync(file, bytes);
  shell.showItemInFolder(file);
  return { path: file };
});

// Printing a PDF from the preview. Electron's built-in PDF viewer has no
// working Print button, so the app prints it itself: the PDF is shown in a
// hidden window and sent to Windows' normal print dialog (printer choice,
// copies, page range). PDFs this app made only, at most 60 MB. If printing
// can't start, the PDF opens in the PC's own PDF program instead, which can print.
ipcMain.handle('print-pdf', async (_event, data) => {
  if (!(data instanceof ArrayBuffer || ArrayBuffer.isView(data))) return { error: 'Only a PDF can be printed' };
  const bytes = Buffer.from(data instanceof ArrayBuffer ? data : data.buffer);
  if (bytes.length > MAX_SEND_BYTES || bytes.subarray(0, 4).toString() !== '%PDF') {
    return { error: 'That file is not a PDF this app made' };
  }
  const file = path.join(app.getPath('temp'), `sandveld-print-${crypto.randomUUID()}.pdf`);
  fs.writeFileSync(file, bytes);
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const remove = () => {
    if (!win.isDestroyed()) win.destroy();
    fs.rm(file, { force: true }, () => {});
  };
  try {
    await win.loadFile(file);
    await new Promise((resolve) => setTimeout(resolve, 800)); // let the viewer lay the pages out
    const result = await new Promise((resolve) => {
      win.webContents.print({ silent: false, printBackground: true }, (success, reason) =>
        resolve(success || reason === 'cancelled' ? { ok: true } : { error: reason || 'Printing failed' }));
    });
    remove();
    return result;
  } catch (error) {
    if (!win.isDestroyed()) win.destroy();
    const failed = await shell.openPath(file); // the PC's own PDF program; the file stays for it
    return failed ? { error: `Couldn't print: ${failed}` } : { ok: true, openedElsewhere: true };
  }
});

// Opens WhatsApp (wa.me, in the user's browser, which hands over to the
// WhatsApp app) or the email program (mailto:). Nothing else - the renderer
// must never be able to make this open arbitrary links or programs.
ipcMain.handle('open-send-link', async (_event, url) => {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return false;
  }
  const allowed = (parsed.protocol === 'https:' && parsed.hostname === 'wa.me') || parsed.protocol === 'mailto:';
  if (!allowed) return false;
  await shell.openExternal(parsed.toString());
  return true;
});

// Directories only: shell.openPath on a *file* launches it with its default
// program, which a compromised renderer must never be able to trigger.
ipcMain.handle('open-folder', async (_event, folderPath) => {
  if (typeof folderPath !== 'string' || !fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    return 'Folder not found';
  }
  return shell.openPath(folderPath);
});

// Google's OAuth flow for a "Desktop app" client wants the authorization
// code to land on a loopback redirect (http://127.0.0.1:<port>) rather than
// a custom URL scheme, per Google's own recommendation for installed apps.
// So: spin up a one-shot local HTTP server to catch that redirect, send the
// user to Google in their normal system browser (never inside an Electron
// window - Google blocks its OAuth screen in embedded webviews), and hand
// the resulting code + PKCE verifier back to the renderer, which forwards
// them to our backend. The backend does the actual token exchange with
// Google using the client secret, which never needs to leave it.
ipcMain.handle('google-oauth-login', async (_event, { clientId }) => {
  if (!clientId) {
    throw new Error('Google sign-in is not configured on this app yet.');
  }

  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  // state: standard OAuth CSRF protection - binds the callback we accept to
  // the specific flow we just started, so a request landing on the loopback
  // server can't be mistaken for a real response from Google unless it
  // carries this value back. nonce: OIDC replay protection - Google embeds
  // it in the id_token itself, and the backend checks it matches after the
  // token exchange (see app/core/google_oauth.py) so a captured id_token
  // from a past sign-in can't be replayed into a fresh one.
  const state = base64url(crypto.randomBytes(16));
  const nonce = base64url(crypto.randomBytes(16));

  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });
  const { port } = server.address();
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'select_account');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('nonce', nonce);

  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Google sign-in timed out - please try again.'));
    }, 120000);

    server.on('request', (req, res) => {
      const reqUrl = new URL(req.url, redirectUri);
      const receivedCode = reqUrl.searchParams.get('code');
      const receivedState = reqUrl.searchParams.get('state');
      const error = reqUrl.searchParams.get('error');
      const stateOk = receivedState === state;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body style="font-family:sans-serif;padding:2rem;text-align:center">' +
        (error || !stateOk
          ? '<h2>Sign-in cancelled</h2><p>You can close this tab and return to Sandveld Vee Dienste.</p>'
          : '<h2>Signed in</h2><p>You can close this tab and return to Sandveld Vee Dienste.</p>') +
        '</body></html>'
      );

      clearTimeout(timeout);
      server.close();

      if (error) reject(new Error(`Google sign-in was cancelled (${error})`));
      else if (!stateOk) reject(new Error('Google sign-in failed a security check (state mismatch) - please try again.'));
      else if (!receivedCode) reject(new Error('Google did not return a sign-in code.'));
      else resolve(receivedCode);
    });

    shell.openExternal(authUrl.toString());
  });

  return { code, codeVerifier, redirectUri, nonce };
});

// Electron's DEFAULT behaviour with no handler set here is to SILENTLY
// GRANT every permission request (geolocation included) with no dialog at
// all - the opposite of a normal browser. The weather widget needs a real,
// one-time "Allow location access?" prompt (asked once, then remembered by
// the renderer - see frontend/src/pages/Weather.jsx), so that prompt has to be shown
// explicitly here. Every other permission type (camera, microphone,
// notifications, etc.) is denied by default - this app doesn't use them.
function registerPermissionHandler() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'geolocation') {
      dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Allow', 'Deny'],
        defaultId: 0,
        cancelId: 1,
        title: 'Location access',
        message: "Allow Sandveld Vee Dienste to use this computer's location for local weather?",
        detail: 'Used only to show the weather forecast for your area. You can change this ' +
          'later on the Weather page ("Change location").',
      }).then((result) => callback(result.response === 0));
      return;
    }
    callback(false);
  });
}

// Electron flags having no Content-Security-Policy as an "Insecure
// Content-Security-Policy" warning in the DevTools console. That warning is
// dev-mode-only noise here for a real reason, not something to silence: Vite
// + @vitejs/plugin-react's Fast Refresh injects an actual inline <script>
// into index.html in dev mode (there's no way around that, it's how HMR
// wires itself up), which a strict script-src would break. The production
// build has no such thing - `npm run build`'s output is plain external
// <script src>/<link> tags with zero inline script or <style> elements
// (React `style={{...}}` props are fine: React applies them through the
// CSSOM, which style-src doesn't restrict) - so the packaged
// app can and does run under a real, strict CSP with no 'unsafe-inline'
// exceptions at all. app.isPackaged is what keeps dev mode unaffected.
function registerContentSecurityPolicy() {
  if (!app.isPackaged) return;

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    // blob: - full-size product pictures (components/ProductPicture.jsx) are
    // fetched with the sign-in token and shown from a blob: URL.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Both localhost and 127.0.0.1 for the backend: CSP treats them as
    // different origins even though they're the same machine, and
    // api/client.js's baseURL uses "localhost" - only allowing 127.0.0.1
    // here silently blocked every API call (caught by actually launching
    // the packaged build and watching it fail to reach the backend, not by
    // reading the code). The open-meteo ones are the Weather widget's
    // forecast/geocoding lookups (see frontend/src/pages/Weather.jsx).
    "connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 https://api.open-meteo.com https://geocoding-api.open-meteo.com",
    "object-src 'none'",
    "base-uri 'self'",
    // Invoice/quote previews (components/DocumentPreview.jsx) show the PDF
    // from a blob: URL the app itself creates, in Electron's PDF viewer.
    "frame-src blob:",
    "form-action 'self'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Electron's PDF viewer is itself a chrome-extension:// page with its own
    // scripts and styles; our policy on it leaves an empty grey viewer
    // (verified with a probe). It's Electron's code, not ours, so leave it
    // on its own policy.
    if (details.url.startsWith('chrome-extension://')) {
      callback({});
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

// One copy of the app at a time: a second launch just brings the first one forward.
// (Two copies would share one backend, and only the one that started it knows the secret.)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    registerPermissionHandler();
    registerContentSecurityPolicy();
    localSecret.installHeader(session.defaultSession, LOCAL_SECRET, [`http://${BACKEND_HOST}:${BACKEND_PORT}/*`, `http://localhost:${BACKEND_PORT}/*`]);
    createWindow();
  });
}

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopBackend);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
