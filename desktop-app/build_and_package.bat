@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Sandveld Vee Dienste - Build ^& Package
echo ============================================
echo.
echo This bundles the Python backend into a standalone executable, builds
echo the frontend, and creates a Windows installer. The result runs on ANY
echo Windows PC - the target machine does not need Python installed.
echo.

if not exist node_modules (
    echo Installing desktop-app dependencies...
    call npm install
    if errorlevel 1 goto :error
)

if not exist frontend\node_modules (
    echo Installing frontend dependencies...
    pushd frontend
    call npm install
    popd
    if errorlevel 1 goto :error
)

echo.
echo ============================================
echo   Step 1/2: Bundling the Python backend
echo ============================================
if not exist "..\venv\Scripts\python.exe" (
    echo ERROR: no venv found at ..\venv - run launch.bat from the project
    echo root at least once first so the backend dependencies are installed.
    goto :error
)

pushd ..
call venv\Scripts\activate.bat
if errorlevel 1 (
    popd
    goto :error
)

echo Installing/updating PyInstaller in the venv...
pip install pyinstaller --quiet
if errorlevel 1 (
    call deactivate
    popd
    goto :error
)

echo Removing any previous backend build...
if exist desktop-app\backend rmdir /s /q desktop-app\backend

echo Running PyInstaller - this is the slowest step and can take a few minutes...
REM --onedir (not --onefile): a folder of files starts faster and is easier
REM to diagnose than a self-extracting single exe, and startup speed matters
REM here since Electron waits for the backend to come up before showing the UI.
REM
REM The --collect-all flags exist because these packages load parts of
REM themselves dynamically (setuptools entry points, plugin registries, etc.)
REM that PyInstaller's static import analysis can't see on its own - most
REM importantly SQLAlchemy's sqlite dialect and uvicorn's event-loop/protocol
REM implementations, which fail SILENTLY at import time otherwise (the exe
REM starts, then immediately errors out or hangs). --exclude-module drops the
REM Streamlit-only dependencies (the secondary frontend/app.py dashboard) that
REM the packaged FastAPI backend never imports, to keep the bundle smaller.
call pyinstaller --noconfirm --clean --onedir --name sandveld-backend ^
    --distpath desktop-app\backend --workpath build\pyinstaller-work --specpath build ^
    --collect-all uvicorn ^
    --collect-all fastapi ^
    --collect-all starlette ^
    --collect-all pydantic ^
    --collect-all pydantic_core ^
    --collect-all sqlmodel ^
    --collect-all sqlalchemy ^
    --collect-all email_validator ^
    --collect-all dns ^
    --collect-all bcrypt ^
    --collect-all openpyxl ^
    --collect-all reportlab ^
    --collect-all multipart ^
    --collect-all pandas ^
    --hidden-import sqlalchemy.dialects.sqlite ^
    --exclude-module streamlit ^
    --exclude-module altair ^
    --exclude-module pyarrow ^
    --exclude-module pydeck ^
    --exclude-module matplotlib ^
    backend_entry.py
if errorlevel 1 (
    call deactivate
    popd
    goto :error
)

call deactivate
popd

if not exist "desktop-app\backend\sandveld-backend\sandveld-backend.exe" (
    echo ERROR: PyInstaller did not produce the expected executable at
    echo desktop-app\backend\sandveld-backend\sandveld-backend.exe
    goto :error
)

echo.
echo ============================================
echo   Step 2/2: Building frontend and installer
echo ============================================
call npm run package
if errorlevel 1 goto :error

echo.
echo ============================================
echo   Done. Installer is in desktop-app\dist\
echo   This installer works on OTHER PCs - no Python needed there.
echo ============================================
pause
exit /b 0

:error
echo.
echo ERROR: something failed above - scroll up for the exact message.
pause
exit /b 1
