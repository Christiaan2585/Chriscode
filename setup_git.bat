@echo off
setlocal
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
    echo Git isn't installed or isn't on PATH. Install it from https://git-scm.com/download/win
    echo then run this script again.
    pause
    exit /b 1
)

if exist .git (
    echo A git repository already exists here - nothing to do.
    pause
    exit /b 0
)

git init
git add .
git commit -m "Initial commit: Sandveld Vee Dienste"

echo.
echo Done. Your project now has version history.
echo Run "git log" any time to see it, or "git status" to see what's changed.
pause
