@echo off
REM Looks for known security problems in the libraries the app is built from.
REM Run before every release (build_and_package.bat runs it for you and warns).
setlocal
cd /d "%~dp0\.."
set FAILED=0

REM pip-audit is a developer tool, not part of the app: fetched on first use.
"..env\Scripts\python.exe" -m pip show pip-audit >nul 2>&1 || "..env\Scripts\python.exe" -m pip install pip-audit

echo ============================================
echo   Security check: Python libraries
echo ============================================
"..\venv\Scripts\python.exe" -m pip_audit -r "..\requirements.txt"
if errorlevel 1 set FAILED=1

echo.
echo ============================================
echo   Security check: desktop app libraries
echo ============================================
call npm audit --omit=dev
if errorlevel 1 set FAILED=1

echo.
echo ============================================
echo   Security check: screen (React) libraries
echo ============================================
pushd frontend
call npm audit --omit=dev
if errorlevel 1 set FAILED=1
popd

echo.
if "%FAILED%"=="1" (
    echo PROBLEMS FOUND above - update those libraries before releasing.
    exit /b 1
)
echo No known problems found.
exit /b 0
