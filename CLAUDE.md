# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Setup & Launch
- **Full Launch (dev mode)**: Run `launch.bat` from the project root. It sets up the Python virtual environment, installs backend and desktop-app dependencies (first run only), then starts the desktop app - which starts the FastAPI backend itself.
- **Build a Windows installer**: Run `desktop-app\build_and_package.bat`. Bundles the Python backend into a standalone executable (via PyInstaller), then builds the frontend and runs `electron-builder` to produce an NSIS installer in `desktop-app\dist\`. Unlike earlier builds, this installer is portable - it needs no Python installed on the target machine, so it can be installed on any Windows PC, not just this one. See "Packaging & cross-PC distribution" below.
- **Manual Setup**:
  ```bash
  python -m venv venv
  venv\Scripts\activate
  pip install -r requirements.txt
  ```

### Running Components Individually
- **Backend API**:
  ```bash
  venv\Scripts\activate
  uvicorn app.main:app --reload
  ```
- **Desktop app (frontend + Electron)**:
  ```bash
  cd desktop-app
  npm run dev
  ```
- **Streamlit dashboard (secondary, kept working but not the shipped app)**:
  ```bash
  venv\Scripts\activate
  streamlit run frontend/app.py
  ```

## Architecture Overview

Sandveld Vee Dienste follows a decoupled client-server architecture:

### Backend (`/app`)
- **Framework**: FastAPI with Uvicorn.
- **Data Layer**: SQLModel (SQLAlchemy + Pydantic) interfacing with a SQLite database (`kyron_agri.db`).
- **Structure**:
    - `app/main.py`: Application entry point and route aggregation. Every business router requires a signed-in user (`Depends(get_current_user)`); only `/`, `/version`, and `/auth/*` are open.
    - `app/models/`: Defines the database schema (Clients, Animals, Invoices, ProductDosing, User, etc.).
    - `app/api/`: Contains the business logic and API endpoints for each module.
    - `app/core/`: Shared utilities - database connection management (`db.py`), PDF generation (`pdf.py`), auth/session handling (`security.py`), Google OAuth (`google_oauth.py`).
- **backend_entry.py** (project root): a plain, importable entry point used only when PyInstaller builds the standalone backend executable - see "Packaging & cross-PC distribution" below. Dev mode never touches this file.

### Authentication
Every user signs in before reaching any business route. Email/password (bcrypt-hashed) is the baseline; "Sign in with Google" can be switched on per `SETUP_GOOGLE_LOGIN.md` (PKCE flow via a loopback redirect, with the id_token verified server-side against Google - the app never trusts a client-supplied identity). The authorization request also carries a per-attempt `state` (checked against the loopback callback before any code is accepted - CSRF protection) and `nonce` (checked against the id_token's own `nonce` claim in `exchange_code_for_profile` - replay protection), both generated in `desktop-app/index.js`. JWT access tokens are held in memory only (never persisted) and signed with a secret generated fresh on every process start. A "remember this device" token (stored as a SHA-256 hash, 45-day lifetime) plus a rate-limited 5-digit PIN let a returning user skip retyping their password on a device they've already signed into. The first person to sign in on a brand-new install becomes admin; admins manage other staff accounts from Settings -> Security.

Every business router is protected once, centrally, in `app/main.py` (`app.include_router(..., dependencies=[Depends(get_current_user)])`) rather than per-endpoint - a file like `app/api/clients.py` shows no auth on its own routes, which reads as a real gap to a scanner or reviewer looking at that file alone. It isn't one; check `app/main.py` before concluding a router is unprotected.

**Electron security (2026-09-24)**: the desktop app's `BrowserWindow` runs with Electron's own recommended, secure defaults - `contextIsolation: true`, `nodeIntegration: false` - rather than exposing Node/`require` directly to the renderer. The one thing the renderer needs from the main process (triggering the Google sign-in loopback flow) is exposed narrowly through `desktop-app/preload.js`'s `contextBridge` as `window.electronAPI.googleLogin(clientId)`; nothing else crosses that boundary. Verified live (not just read): launched the actual Electron shell and confirmed in DevTools that `window.electronAPI.googleLogin` is a function while `window.require` is `undefined`, and that normal app usage (login, PIN setup, navigation) still works under the tightened settings.

**Content-Security-Policy (2026-09-24)**: packaged builds only (`app.isPackaged` guard in `index.js`'s `registerContentSecurityPolicy()` - dev mode needs Vite/React-Refresh's inline script, which a strict CSP would break) run under a real CSP with no `unsafe-inline` anywhere, injected via `session.defaultSession.webRequest.onHeadersReceived`. `connect-src` explicitly lists both `http://127.0.0.1:8000` *and* `http://localhost:8000` - CSP treats those as different origins even though they're the same machine, and missing one of them silently breaks every API call with no error visible anywhere except the DevTools console. Found by actually launching the packaged build and watching the login screen fail with "Could not reach the backend" - reading the code gave no hint of it.

**Never use a JSX `<style>` tag (or any inline `<style>` element) in the frontend.** `style-src 'self'` blocks it in the packaged app while dev mode (no CSP) renders it perfectly, so it passes every dev-mode check and then ships broken - this is exactly how the header's chase animation (`GrazingHeaderStrip.jsx`) shipped unstyled and frozen on 2026-09-24. Put CSS in `index.css` (bundled as an external stylesheet) or use Tailwind classes. React `style={{...}}` props are fine (React sets them via CSSOM, which CSP doesn't block). To check a visual change under the real CSP without the Electron shell: `npm run build` in `frontend/`, serve `dist/` with a `Content-Security-Policy` header matching `index.js`'s, and inspect it in a browser.

**Packaged build was completely broken before today (2026-09-24), unrelated to the CSP work**: `index.js` computed `isDev` via `require('electron-is-dev')`, but that package's current release is ESM-only (`export default`). Requiring an ESM package from CommonJS like that doesn't unwrap the default export - the result is the whole module namespace object (`{ __esModule: true, default: false }`), which is a truthy *object*, not the boolean it looks like. So `isDev` was `true` in every build, packaged or not, and the packaged app was always trying to load `http://localhost:5173` (Vite's dev server) instead of its own bundled files - a blank white window on any machine without that dev server running, i.e. every real install. Fixed by dropping the dependency entirely in favor of `!app.isPackaged` directly (which is what that package computed internally anyway with no env override). This had been shipping since the very first installer build and was only caught now by actually launching the packaged `.exe` and looking at the window instead of just checking the backend health endpoint - worth remembering next time something about the packaged build "seems to work" based on backend-only checks.

### Desktop App (`/desktop-app`) - primary frontend
- **Framework**: Electron + React (Vite, Tailwind).
- `index.js` is the Electron main process. In dev mode it starts the FastAPI backend from this project's own `venv`, exactly as before. In a packaged build it instead spawns the bundled standalone backend executable (see below) and points it at a writable per-user data folder via `SANDVELD_DATA_DIR`.
- `frontend/` is the React app (`npm run dev` for the Vite dev server, `npm run build` for the production bundle).
- `build_and_package.bat` bundles the backend with PyInstaller, builds the frontend, and runs `electron-builder` to produce a Windows installer in `dist/`.

### Streamlit Dashboard (`/frontend`) - secondary
- A lightweight alternative view of the same backend. Kept working, but the desktop app is the one being packaged and distributed.

## Packaging & cross-PC distribution

The installer produced by `desktop-app\build_and_package.bat` is meant to be handed to a client or installed on any Windows PC, not just this development machine. Two things make that possible:

1. **The Python backend is bundled, not assumed.** `build_and_package.bat` runs PyInstaller against `backend_entry.py` (from this project's own `venv`) to produce a standalone executable at `desktop-app\backend\sandveld-backend\sandveld-backend.exe`. `package.json`'s `build.extraResources` then ships that folder inside the installer's `resources\backend\`. `index.js` spawns that exe directly in a packaged build - the target PC needs no Python installation at all.
2. **Live data lives outside the install folder.** A packaged app's own install folder can be read-only and gets replaced on every update, so the database and Google OAuth config can't live there. `index.js` calls `app.setName('Sandveld Vee Dienste')` and passes Electron's `app.getPath('userData')` (e.g. `%APPDATA%\Sandveld Vee Dienste`) to the backend via the `SANDVELD_DATA_DIR` environment variable. `app/core/db.py` and `app/core/google_oauth.py` both read that variable - when it's set, the database and OAuth config live there instead of the project-relative paths dev mode uses. Dev mode never sets this variable, so `launch.bat` / `npm run dev` are completely unaffected and keep using `./kyron_agri.db` and `./config/google_oauth.json` exactly as before.

The live database path is exposed via `GET /version` (`database_path` field) and shown on the Settings page, so a user always knows where their data actually is without needing to know about `SANDVELD_DATA_DIR`.

**First build on a new machine, or after adding a new dependency**: PyInstaller's static analysis can miss packages that load parts of themselves dynamically. `build_and_package.bat` already passes `--collect-all` for every dependency this backend actually imports (uvicorn, fastapi, starlette, pydantic/pydantic_core, sqlmodel, sqlalchemy, email_validator, dns, bcrypt, openpyxl, reportlab, multipart, pandas) plus an explicit `--hidden-import sqlalchemy.dialects.sqlite`, and excludes the Streamlit-only dependencies (streamlit, altair, pyarrow, pydeck, matplotlib) that the FastAPI backend never imports. If a future dependency is added to `requirements.txt` and the packaged app fails to start with a `ModuleNotFoundError` in its logs (or the bundled exe exits immediately with no obvious error), the fix is almost always adding that package to the `--collect-all` list in `build_and_package.bat`.

**Verified end-to-end on 2026-09-23**: ran `build_and_package.bat`'s two steps directly (PyInstaller, then `npm run package`) on this dev machine. The bundled backend exe is ~150MB (mostly pandas/reportlab/sqlalchemy), the final NSIS installer is ~235MB. Confirmed the packaged app actually works, not just that it builds: launched `dist\win-unpacked\Sandveld Vee Dienste.exe` directly (without running the installer, so it doesn't touch the real system install path), and confirmed the bundled backend started, wrote to `backend.log` in `%APPDATA%\Sandveld Vee Dienste`, and served `/auth/status` correctly with a fresh empty database. That confirms the `SANDVELD_DATA_DIR` wiring and the `--collect-all` list are both correct as-is.

Two things worth knowing for next time:
- `--collect-all pandas` pulls in pandas' entire internal test suite (`pandas.tests.*`, thousands of modules) since PyInstaller can't distinguish "real" submodules from test ones - this is most of why the PyInstaller step is slow. It doesn't break anything, just wastes build time and a bit of installer size. Not worth touching unless build time becomes a real problem (a fix would be `--exclude-module pandas.tests` alongside the existing `--collect-all pandas`).
- The installer is unsigned (no code-signing certificate), so Windows SmartScreen will show an "unknown publisher" warning on a client's PC. That's expected for informal client testing - click "More info" -> "Run anyway". A real code-signing cert would remove this warning if the app moves beyond client testing to wider distribution.

**`build_and_package.bat` itself had never actually completed a full run before 2026-09-24**: the script's own check after Step 1 (`if not exist "desktop-app\backend\sandveld-backend\sandveld-backend.exe" ...`) ran from inside the `desktop-app` directory (the script `popd`s back there right before the check), so the path it checked always doubled to the nonexistent `desktop-app\desktop-app\backend\...` - PyInstaller was succeeding every time, but the script always concluded it hadn't and aborted before Step 2. The 2026-09-23 "verified end-to-end" pass never caught this because it ran the two build steps by hand instead of through this script. Fixed by dropping the redundant `desktop-app\` prefix from that one check. Worth remembering: running the individual commands a script wraps is not the same as running the script.

## Auto-updates (GitHub Releases)

Clients don't reinstall by hand for every new version - the packaged app checks GitHub Releases for a newer one, downloads it in the background, and prompts to restart. This only runs in a packaged build (`app.isPackaged` guards it in `index.js`'s `setupAutoUpdater()`); dev mode (`npm run dev` / `launch.bat`) never checks.

- **Library**: `electron-updater`, wired in `desktop-app/index.js`. Events (`checking-for-update`, `update-available`, `update-downloaded`, `error`, etc.) are logged to the same `backend.log` in `%APPDATA%\Sandveld Vee Dienste` that the backend itself writes to, so a failed update check is visible in the one log file a client might be asked to send in. On `update-downloaded` it shows a native "Restart now / Later" dialog; "Later" still installs automatically the next time the app quits (`autoInstallOnAppQuit`).
- **Checks**: automatically once on launch and every 4 hours after that (`UPDATE_CHECK_INTERVAL_MS`), plus on demand from Settings -> "Software Update" -> "Check for Updates" (2026-09-24 addition - before this, the only way to know update status at all was reading `backend.log`, and a long-running session would never re-check after its one startup check). Status (`checking` / `up-to-date` / `downloading` + percent / `downloaded` / `error`) is pushed live to the renderer via `mainWindow.webContents.send('update-status', ...)` and exposed through `preload.js`'s `window.electronAPI.{checkForUpdates, quitAndInstall, getUpdateStatus, onUpdateStatus}` - `frontend/src/utils/updater.js` wraps that for `Settings.jsx`, and gracefully shows "not available in development mode" when `window.electronAPI.checkForUpdates` doesn't exist (dev mode, or a plain browser tab).
- **Feed**: `package.json`'s `build.publish` block (`provider: "github"`, `owner`, `repo`) - a **public** repo, chosen specifically so `electron-updater` can check and download releases with a plain anonymous HTTPS request, no token needed on client machines. (A private repo would need a read-only GitHub token baked into every shipped build to do the same thing.)
- **Cutting a release**:
  1. Bump the version in *both* `desktop-app/package.json` (`"version"`, what `electron-updater` actually compares) and `version.json` at the project root (what `GET /version` and the Settings page display to a user) - keep them in sync so what a client sees in-app matches what actually shipped.
  2. Build it: `npm run package` (from `desktop-app/`) after the PyInstaller backend step (see above) - produces the installer `.exe` plus `latest.yml` and a `.blockmap` file in `desktop-app/dist/`. All three must be uploaded as release assets - `electron-updater` reads `latest.yml` first to find out what the current release even is, so an installer with no `latest.yml` next to it is invisible to the auto-updater even though a person could still download and run it manually.
  3. On GitHub: Releases -> Draft a new release -> tag it `v<version>` (must match `package.json`'s version) -> upload those three files -> Publish.
  4. Alternative to steps 2-3: `npm run release` runs the same build with `--publish always`, which uploads directly to GitHub Releases for you - but needs a `GH_TOKEN` environment variable set to a personal access token with `repo` scope for that account first. Nothing to set up until this is actually wanted; the manual upload path works fine without it.

## Key Modules
- **Analytics**: Aggregates data for overdue treatments and revenue. `GET /analytics/revenue-by-month` returns paid-invoice revenue for each of the last N months (default 12), zero-filling months with no paid invoices so the dashboard's sales chart (`Dashboard.jsx`, via `recharts`) has a continuous timeline instead of gaps.
- **Client/Animal Management**: Tracks livestock health history and client contact details.
- **Invoicing**: Handles product price imports via Excel and generates professional PDFs.
- **Data import**: Settings page has an "Import from Excel / CSV" section (`ImportModal.jsx`, reused across all three) for Products (`POST /products/import`), Clients (`POST /clients/import`) and Herding Programs (`POST /programs/import`, groups rows by Client+Program Name so one row per animal type becomes one program with multiple `AnimalGroup`s - the client must already exist, this endpoint never creates one). All three do per-row error handling so one bad row can't abort the batch.
- **Dosage Calculator**: Species-aware dosing calculator (`app/models/product_dosing.py`, `app/api/dosing.py`, `Calculator.jsx`). Each product/species combination has a dosing rule (per-kg bodyweight, per-head fixed dose, per-quarter intramammary tube, or label-only/manual) with a confidence rating (high/medium/low/unverified) so low-confidence data is never presented with false authority. Staff can correct a rate after checking the physical label via `PUT /dosing/{id}`.

**The toast error-notification system was dead code until 2026-09-24**: `ToastContext.jsx` had a whole comment describing `api/client.js`'s response interceptor calling `showToast()` on every failed request via a `setErrorNotifier` bridge - but that function never existed, and `ToastProvider` was never mounted anywhere in `App.jsx`. Every failed save/update/delete in the entire app - not just herding programs, literally everything, since almost no page had its own `onError` handler either - was failing completely silently: no error, no toast, the modal just stays open with the entered data lost. This is why "click Save, nothing happens" could occur with zero visible cause. Now actually wired: `api/client.js` exports `setErrorNotifier`, `ToastContext.jsx`'s new `ToastErrorBridge` registers it from inside `<ToastProvider>`, and `App.jsx` mounts both. `showToast` also dedupes identical concurrent errors (e.g. a page's several queries all failing the same way) via a ref-backed lookup rather than reading React state directly, since several `showToast` calls in the same tick would otherwise all see the same pre-render state and stack up duplicates. If a save ever silently does nothing again, check this wiring first before assuming it's a new bug.

## Known limitations (as of 2026-09-24)
- No automated database backups - `kyron_agri.db` should be copied manually before updates (the Settings page shows exactly where it lives).
- Business settings shown in the Settings page (VAT, currency, date format) are display-only, not yet editable.
- The cross-PC installer (see "Packaging & cross-PC distribution" above) has been built and statically checked but not yet run end-to-end on real hardware - the first live build/install should be treated as a test, with a troubleshooting path already documented above for the most likely failure mode (a missing PyInstaller `--collect-all` entry).
- Herding-program import (`POST /programs/import`) doesn't dedupe against an already-existing program of the same name for the same client - re-importing the same file creates a second copy rather than merging into the first.
