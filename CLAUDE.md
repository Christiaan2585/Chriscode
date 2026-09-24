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

## Auto-updates (GitHub Releases)

Clients don't reinstall by hand for every new version - the packaged app checks GitHub Releases for a newer one, downloads it in the background, and prompts to restart. This only runs in a packaged build (`app.isPackaged` guards it in `index.js`'s `setupAutoUpdater()`); dev mode (`npm run dev` / `launch.bat`) never checks.

- **Library**: `electron-updater`, wired in `desktop-app/index.js`. Events (`checking-for-update`, `update-available`, `update-downloaded`, `error`, etc.) are logged to the same `backend.log` in `%APPDATA%\Sandveld Vee Dienste` that the backend itself writes to, so a failed update check is visible in the one log file a client might be asked to send in. On `update-downloaded` it shows a native "Restart now / Later" dialog; "Later" still installs automatically the next time the app quits (`autoInstallOnAppQuit`).
- **Feed**: `package.json`'s `build.publish` block (`provider: "github"`, `owner`, `repo`) - a **public** repo, chosen specifically so `electron-updater` can check and download releases with a plain anonymous HTTPS request, no token needed on client machines. (A private repo would need a read-only GitHub token baked into every shipped build to do the same thing.)
- **Cutting a release**:
  1. Bump the version in *both* `desktop-app/package.json` (`"version"`, what `electron-updater` actually compares) and `version.json` at the project root (what `GET /version` and the Settings page display to a user) - keep them in sync so what a client sees in-app matches what actually shipped.
  2. Build it: `npm run package` (from `desktop-app/`) after the PyInstaller backend step (see above) - produces the installer `.exe` plus `latest.yml` and a `.blockmap` file in `desktop-app/dist/`. All three must be uploaded as release assets - `electron-updater` reads `latest.yml` first to find out what the current release even is, so an installer with no `latest.yml` next to it is invisible to the auto-updater even though a person could still download and run it manually.
  3. On GitHub: Releases -> Draft a new release -> tag it `v<version>` (must match `package.json`'s version) -> upload those three files -> Publish.
  4. Alternative to steps 2-3: `npm run release` runs the same build with `--publish always`, which uploads directly to GitHub Releases for you - but needs a `GH_TOKEN` environment variable set to a personal access token with `repo` scope for that account first. Nothing to set up until this is actually wanted; the manual upload path works fine without it.

## Key Modules
- **Analytics**: Aggregates data for overdue treatments and revenue.
- **Client/Animal Management**: Tracks livestock health history and client contact details.
- **Invoicing**: Handles product price imports via Excel and generates professional PDFs.
- **Dosage Calculator**: Species-aware dosing calculator (`app/models/product_dosing.py`, `app/api/dosing.py`, `Calculator.jsx`). Each product/species combination has a dosing rule (per-kg bodyweight, per-head fixed dose, per-quarter intramammary tube, or label-only/manual) with a confidence rating (high/medium/low/unverified) so low-confidence data is never presented with false authority. Staff can correct a rate after checking the physical label via `PUT /dosing/{id}`.

## Known limitations (as of 2026-09-22)
- No automated database backups - `kyron_agri.db` should be copied manually before updates (the Settings page shows exactly where it lives).
- Business settings shown in the Settings page (VAT, currency, date format) are display-only, not yet editable.
- The cross-PC installer (see "Packaging & cross-PC distribution" above) has been built and statically checked but not yet run end-to-end on real hardware - the first live build/install should be treated as a test, with a troubleshooting path already documented above for the most likely failure mode (a missing PyInstaller `--collect-all` entry).
