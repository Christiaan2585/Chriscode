@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Sandveld Vee Dienste - Launcher
echo ============================================
echo.

if not exist venv (
    echo Creating Python virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo.
        echo ERROR: Could not create the virtual environment. Is Python installed and on PATH?
        pause
        exit /b 1
    )
)

call venv\Scripts\activate.bat

echo Installing/checking Python dependencies...
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo.
    echo ERROR: Failed to install Python dependencies. See the messages above.
    pause
    exit /b 1
)

if not exist desktop-app\node_modules (
    echo Installing desktop app dependencies - first run only, this can take a few minutes...
    pushd desktop-app
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed in desktop-app.
        popd
        pause
        exit /b 1
    )
    popd
)

if not exist desktop-app\frontend\node_modules (
    echo Installing frontend dependencies - first run only...
    pushd desktop-app\frontend
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed in desktop-app\frontend.
        popd
        pause
        exit /b 1
    )
    popd
)

echo.
echo Starting Sandveld Vee Dienste - backend + desktop app...
echo A separate window will open for the app. Close that window to stop everything.
echo.

pushd desktop-app
call npm run dev
popd

pause
