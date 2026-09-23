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
Every user signs in before reaching any business route. Email/password (bcrypt-hashed) is the baseline; "Sign in with Google" can be switched on per `SETUP_GOOGLE_LOGIN.md` (PKCE flow via a loopback redirect, with the id_token verified server-side against Google - the app never trusts a client-supplied identity). JWT access tokens are held in memory only (never persisted) and signed with a secret generated fresh on every process start. A "remember this device" token (stored as a SHA-256 hash, 45-day lifetime) plus a rate-limited 5-digit PIN let a returning user skip retyping their password on a device they've already signed into. The first person to sign in on a brand-new install becomes admin; admins manage other staff accounts from Settings -> Security.

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

This part of the setup has not been run end-to-end on real hardware yet - it was built and statically verified (`py_compile`, `node --check`, JSON/JSX syntax checks) without the ability to execute PyInstaller or run the resulting installer. Treat the first real build as a test: if it fails, the backend's own console output (visible before the Electron window loads, or in `%APPDATA%\Sandveld Vee Dienste` logs if added later) should point at the missing import.

## Key Modules
- **Analytics**: Aggregates data for overdue treatments and revenue.
- **Client/Animal Management**: Tracks livestock health history and client contact details.
- **Invoicing**: Handles product price imports via Excel and generates professional PDFs.
- **Dosage Calculator**: Species-aware dosing calculator (`app/models/product_dosing.py`, `app/api/dosing.py`, `Calculator.jsx`). Each product/species combination has a dosing rule (per-kg bodyweight, per-head fixed dose, per-quarter intramammary tube, or label-only/manual) with a confidence rating (high/medium/low/unverified) so low-confidence data is never presented with false authority. Staff can correct a rate after checking the physical label via `PUT /dosing/{id}`.

## Known limitations (as of 2026-09-22)
- No automated database backups - `kyron_agri.db` should be copied manually before updates (the Settings page shows exactly where it lives).
- Business settings shown in the Settings page (VAT, currency, date format) are display-only, not yet editable.
- The cross-PC installer (see "Packaging & cross-PC distribution" above) has been built and statically checked but not yet run end-to-end on real hardware - the first live build/install should be treated as a test, with a troubleshooting path already documented above for the most likely failure mode (a missing PyInstaller `--collect-all` entry).
