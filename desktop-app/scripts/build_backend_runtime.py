"""Builds the backend that ships inside the installer: a small copy of the Python runtime plus the app's own source files.

Why not PyInstaller any more: PyInstaller makes a NEW, unsigned program (sandveld-backend.exe) on every build, and Windows
Smart App Control refuses to run an unsigned program it hasn't seen before - on PCs with it switched on the app opened
blank. Here the program that runs is python.exe, signed by the Python Software Foundation (and renamed to
sandveld-backend.exe so the rest of the app keeps finding it; the signature doesn't depend on the file name). Everything we
change between releases is plain .py/.pyc text, which Smart App Control doesn't judge. No certificate is needed, and
nothing is downloaded at run time (the libraries are installed into the folder here, at build time).

Output: desktop-app/backend/sandveld-backend/
    sandveld-backend.exe        a copy of the signed python.exe
    python314.dll, DLLs/, Lib/  the Python runtime and standard library (Lib/site-packages = the app's libraries)
    app/, backend_entry.py      the app's source, version.json, assets/logo.png

Run with the project's venv:  venv\\Scripts\\python.exe desktop-app\\scripts\\build_backend_runtime.py
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "desktop-app", "backend", "sandveld-backend")
BASE = sys.base_prefix  # the Python install the venv was made from (signed by the Python Software Foundation)

# Parts of the standard library the backend never needs: the biggest savings, nothing the app imports.
SKIP_LIB = {"test", "idlelib", "tkinter", "turtledemo", "ensurepip", "pydoc_data", "venv", "site-packages", "__pycache__",
            "__phello__", "lib2to3", "turtle.py"}
SKIP_DLLS = {"tcl86t.dll", "tk86t.dll", "_tkinter.pyd", "tcl", "tk"}
RUNTIME_FILES = ["python.exe", "python3.dll", "python%d%d.dll" % sys.version_info[:2], "vcruntime140.dll", "vcruntime140_1.dll", "LICENSE.txt"]


def say(text):
    print(f"[backend runtime] {text}", flush=True)


def copy_tree(src, dst, skip=()):
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(src):
        if name in skip:
            continue
        s, d = os.path.join(src, name), os.path.join(dst, name)
        if os.path.isdir(s):
            copy_tree(s, d, skip)
        else:
            shutil.copy2(s, d)


def pinned_requirements():
    """name==version for every library requirements.txt needs, and everything those need in turn, as installed in THIS venv.
    (requirements.txt has no versions: installing "latest" gave a newer sqlmodel than the one the app was written against, and
    sign-up failed on a datetime rule. What the tests run against is what ships.)"""
    from importlib import metadata
    from pip._vendor.packaging.requirements import Requirement
    from pip._vendor.packaging.utils import canonicalize_name

    wanted = [Requirement(line.strip()).name for line in open(os.path.join(ROOT, "requirements.txt"), encoding="utf-8")
              if line.strip() and not line.strip().startswith("#") and not line.strip().lower().startswith("pyinstaller")]
    found = {}
    queue = list(wanted)
    while queue:
        name = canonicalize_name(queue.pop())
        if name in found:
            continue
        try:
            dist = metadata.distribution(name)
        except metadata.PackageNotFoundError:
            raise SystemExit(f"{name} is needed but not installed in the venv - run: venv\\Scripts\\python.exe -m pip install -r requirements.txt")
        found[name] = dist.version
        for text in dist.requires or []:
            req = Requirement(text)
            if req.marker is None or req.marker.evaluate({"extra": ""}):
                queue.append(req.name)
    return sorted(f"{name}=={version}" for name, version in found.items() if name != "pyinstaller")


def main():
    if os.name != "nt":
        raise SystemExit("The installer's backend is built on Windows only.")
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    say(f"copying the Python runtime from {BASE}")
    for name in RUNTIME_FILES:
        src = os.path.join(BASE, name)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(OUT, "sandveld-backend.exe" if name == "python.exe" else name))
        elif name in ("python.exe", "python3.dll") or name.startswith("python3"):
            raise SystemExit(f"Missing {name} in {BASE}")
    copy_tree(os.path.join(BASE, "DLLs"), os.path.join(OUT, "DLLs"), SKIP_DLLS)
    copy_tree(os.path.join(BASE, "Lib"), os.path.join(OUT, "Lib"), SKIP_LIB)

    say("installing the app's libraries into it (the exact versions this project is developed and tested with)")
    pins = pinned_requirements()
    say(f"{len(pins)} libraries")
    site = os.path.join(OUT, "Lib", "site-packages")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "--no-warn-script-location", "--no-deps", "--target", site] + pins)
    for leftover in ("bin", "Scripts"):  # command-line launchers (unsigned exes the app never uses)
        shutil.rmtree(os.path.join(site, leftover), ignore_errors=True)
    for dirpath, dirnames, _ in os.walk(site):  # the libraries' own tests
        for d in list(dirnames):
            if d in ("tests", "test", "__pycache__") and "numpy" not in dirpath:
                shutil.rmtree(os.path.join(dirpath, d), ignore_errors=True)
                dirnames.remove(d)
    for exe in [os.path.join(dp, f) for dp, _, fs in os.walk(site) for f in fs if f.lower().endswith(".exe")]:
        os.remove(exe)

    say("copying the app")
    copy_tree(os.path.join(ROOT, "app"), os.path.join(OUT, "app"), {"__pycache__"})
    shutil.copy2(os.path.join(ROOT, "backend_entry.py"), os.path.join(OUT, "backend_entry.py"))
    shutil.copy2(os.path.join(ROOT, "version.json"), os.path.join(OUT, "version.json"))
    os.makedirs(os.path.join(OUT, "assets"))
    shutil.copy2(os.path.join(ROOT, "desktop-app", "frontend", "src", "assets", "logo.png"), os.path.join(OUT, "assets", "logo.png"))

    say("pre-compiling (so the first start is quick; the app never writes into its install folder)")
    exe = os.path.join(OUT, "sandveld-backend.exe")
    subprocess.check_call([exe, "-s", "-m", "compileall", "-q", "-j", "0", "--invalidation-mode", "unchecked-hash",
                           os.path.join(OUT, "Lib"), os.path.join(OUT, "app")])

    say("checking that it starts and the app imports")
    result = subprocess.run([exe, "-B", "-s", "-c", "import app.main, uvicorn, sqlite3, ssl; print('ok')"], cwd=OUT, capture_output=True, text=True)
    if result.returncode != 0 or "ok" not in result.stdout:
        raise SystemExit("The new backend failed its start-up check:\n" + result.stdout + result.stderr)
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs) / 1e6
    say(f"done: {size:.0f} MB in {OUT}")


if __name__ == "__main__":
    main()
