@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Sandveld Vee Dienste - Build ^& Package
echo ============================================
echo.
echo This bundles the Python backend with its own Python runtime, builds
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
echo Checking the libraries for known security problems...
call "%~dp0scripts\security-check.bat"
if errorlevel 1 (
    echo.
    echo WARNING: known security problems were found in the libraries ^(see above^). The build continues,
    echo but update them before this goes to anyone.
    echo.
)

echo ============================================
echo   Step 1/2: Building the backend runtime
echo ============================================
if not exist "..\venv\Scripts\python.exe" (
    echo ERROR: no venv found at ..\venv - run launch.bat from the project
    echo root at least once first so the backend dependencies are installed.
    goto :error
)

REM Removed first, before anything that can fail: if any later part of this
REM step is skipped or blocked, there is no old exe left for the check after
REM the build to find, so the build stops instead of packaging a stale
REM backend. (On 2026-09-27 Device Guard blocked pip.exe, the rest of this
REM step was silently skipped, and an installer was built around the old
REM 25-Sep backend.)
echo Removing any previous backend build...
if exist backend rmdir /s /q backend
if exist backend (
    echo ERROR: could not delete desktop-app\backend - is the app or its backend still running?
    goto :error
)

pushd ..
call venv\Scripts\activate.bat
if errorlevel 1 (
    popd
    goto :error
)

REM The backend is a copy of the signed Python runtime plus the app's source (scripts\build_backend_runtime.py), NOT a
REM PyInstaller exe: Windows Smart App Control refuses a new unsigned exe on every build, but accepts python.exe (signed by
REM the Python Software Foundation). "python -m" rather than pip.exe: those launchers are unsigned and Device Guard blocks them.
echo Building the backend runtime - this takes a minute or two...
python desktop-app\scripts\build_backend_runtime.py
if errorlevel 1 (
    call deactivate
    popd
    goto :error
)

call deactivate
popd

if not exist "backend\sandveld-backend\sandveld-backend.exe" (
    echo ERROR: the backend runtime was not built at
    echo desktop-app\backend\sandveld-backend\sandveld-backend.exe
    goto :error
)
if not exist "backend\sandveld-backend\assets\logo.png" (
    echo ERROR: the backend was built without the invoice logo - check scripts\build_backend_runtime.py.
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
