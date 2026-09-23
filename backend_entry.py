"""Standalone entry point for the packaged backend.

Dev mode never uses this file - `launch.bat` / `npm run dev` spawn
`venv\\Scripts\\python.exe -m uvicorn app.main:app` directly against this
project's own virtual environment (see desktop-app/index.js).

This file exists purely so PyInstaller has a plain, importable script to
build the standalone backend executable from (see
desktop-app/build_and_package.bat, which runs PyInstaller against this file
before packaging the Electron app). The resulting exe is what lets the app
run on ANY Windows PC without that PC needing Python installed at all.

Reads its host/port/data directory from environment variables, which is how
desktop-app/index.js configures it when spawning it as a child process.
"""
import os


def main():
    import uvicorn
    from app.main import app

    host = os.environ.get("SANDVELD_BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("SANDVELD_BACKEND_PORT", "8000"))
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
