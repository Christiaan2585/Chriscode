const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');

// Sets the folder name Electron's app.getPath('userData') resolves to
// (otherwise it falls back to package.json's "name", i.e. the kebab-case
// "sandveld-vee-dienste"). Must run before any app.getPath() call below.
app.setName('Sandveld Vee Dienste');

const BACKEND_HOST = '127.0.0.1';
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

async function startBackend() {
  if (await isBackendUp()) {
    console.log(`Backend already running on port ${BACKEND_PORT} - reusing it.`);
    return;
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
        },
      }
    );

    backendProcess.on('error', (err) => {
      const msg = `Failed to start the bundled backend: ${err.message}`;
      console.error(msg);
      logToBackendFile(msg);
      dialog.showErrorBox(
        'Sandveld Vee Dienste - backend failed to start',
        `${msg}\n\nA log file may have more detail at:\n${path.join(PACKAGED_DATA_DIR, 'backend.log')}`
      );
    });

    backendProcess.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        logToBackendFile(`Backend exited unexpectedly (code=${code}, signal=${signal})`);
      }
    });
  } else {
    // Dev mode: unchanged - run straight out of this project's own venv.
    console.log(`Starting backend from ${PROJECT_ROOT} using ${PYTHON_BIN}`);
    backendProcess = spawn(
      PYTHON_BIN,
      ['-m', 'uvicorn', 'app.main:app', '--host', BACKEND_HOST, '--port', String(BACKEND_PORT)],
      { cwd: PROJECT_ROOT, windowsHide: true }
    );

    backendProcess.on('error', (err) => {
      console.error('Failed to start the backend automatically:', err.message);
      console.error(`Expected a Python virtual environment at: ${PYTHON_BIN}`);
    });
  }

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
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Sandveld Vee Dienste',
    // A packaged build already gets its icon from the exe itself (package.json's
    // build.win.icon); this is what makes the window/taskbar icon correct when
    // just running `npm run dev` too, instead of Electron's default icon.
    icon: path.join(__dirname, 'build', 'icon.ico'),
  });

  await startBackend();
  const backendReady = await waitForBackend();
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
function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    logToBackendFile('[updater] checking for update...');
  });
  autoUpdater.on('update-available', (info) => {
    logToBackendFile(`[updater] update available: v${info.version} - downloading...`);
  });
  autoUpdater.on('update-not-available', () => {
    logToBackendFile('[updater] already on the latest version.');
  });
  autoUpdater.on('error', (err) => {
    logToBackendFile(`[updater] check/download failed: ${err.message}`);
  });
  autoUpdater.on('download-progress', (progress) => {
    logToBackendFile(`[updater] downloading update: ${Math.round(progress.percent)}%`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    logToBackendFile(`[updater] update downloaded: v${info.version}`);
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

  autoUpdater.checkForUpdates().catch((err) => {
    logToBackendFile(`[updater] check failed: ${err.message}`);
  });
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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
// the renderer - see WeatherWidget.jsx), so that prompt has to be shown
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
          'later from the Weather widget on the Dashboard ("Change location").',
      }).then((result) => callback(result.response === 0));
      return;
    }
    callback(false);
  });
}

app.whenReady().then(() => {
  registerPermissionHandler();
  createWindow();
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopBackend);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
