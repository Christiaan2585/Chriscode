"""Automatic database backups.

A backup is a full snapshot of the SQLite database taken with SQLite's own
online-backup API (safe while the app is using the database - a plain file
copy of a live SQLite file can capture a half-written page). Snapshots go to
`<data dir>/backups/` and, optionally, to a second folder the user picks
(a OneDrive / Google Drive folder or a USB drive) so a copy survives the PC
itself dying. Only files matching our own name pattern are ever pruned, so
pointing the extra folder at a folder that holds other files is safe.
"""
import json
import logging
import os
import re
import shutil
import sqlite3
import threading
import time
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger("uvicorn.error")

EXTRA_SUBFOLDER = "Sandveld Vee Dienste Backups"
DEFAULT_KEEP = 30
BACKUP_INTERVAL = timedelta(hours=24)
_NAME_RE = re.compile(r"^kyron_agri-(\d{8}-\d{6})\.db$")
_STAMP_FORMAT = "%Y%m%d-%H%M%S"

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def default_backup_dir() -> str:
    data_dir = os.getenv("SANDVELD_DATA_DIR") or _PROJECT_ROOT
    return os.path.join(data_dir, "backups")


def settings_path() -> str:
    data_dir = os.getenv("SANDVELD_DATA_DIR")
    if data_dir:
        return os.path.join(data_dir, "backup_settings.json")
    return os.path.join(_PROJECT_ROOT, "config", "backup_settings.json")


def _atomic_write(write_to_path, target: str) -> None:
    # Write under a temporary name and rename, so an interrupted backup (app
    # closed mid-copy, USB drive pulled) never leaves a truncated file that
    # looks like a valid snapshot.
    partial = target + ".partial"
    try:
        write_to_path(partial)
        os.replace(partial, target)
    finally:
        if os.path.exists(partial):
            os.remove(partial)


def create_backup(db_path: str, dest_dir: str, now: Optional[datetime] = None) -> str:
    # sqlite3.connect() on a missing path silently creates an empty database,
    # which would then be "backed up" as if it were real data.
    if not os.path.isfile(db_path):
        raise FileNotFoundError(f"Database not found: {db_path}")
    os.makedirs(dest_dir, exist_ok=True)
    stamp = (now or datetime.now()).strftime(_STAMP_FORMAT)
    target = os.path.join(dest_dir, f"kyron_agri-{stamp}.db")

    def snapshot(path):
        src = sqlite3.connect(db_path)
        dst = sqlite3.connect(path)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()

    _atomic_write(snapshot, target)
    return target


def list_backups(dest_dir: str) -> list:
    if not os.path.isdir(dest_dir):
        return []
    backups = []
    for name in os.listdir(dest_dir):
        match = _NAME_RE.match(name)
        if not match:
            continue
        path = os.path.join(dest_dir, name)
        backups.append({
            "name": name,
            "path": path,
            "size": os.path.getsize(path),
            "created_at": datetime.strptime(match.group(1), _STAMP_FORMAT),
        })
    return sorted(backups, key=lambda b: b["created_at"], reverse=True)


def prune_backups(dest_dir: str, keep: int) -> list:
    removed = []
    for old in list_backups(dest_dir)[max(keep, 1):]:
        os.remove(old["path"])
        removed.append(old["path"])
    return removed


def is_backup_due(last: Optional[datetime], now: datetime, interval: timedelta = BACKUP_INTERVAL) -> bool:
    return last is None or now - last >= interval


def load_settings(path: str) -> dict:
    settings = {"extra_folder": None, "keep": DEFAULT_KEEP}
    try:
        with open(path, "r") as f:
            stored = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return settings
    settings["extra_folder"] = stored.get("extra_folder") or None
    try:
        settings["keep"] = max(1, int(stored.get("keep", DEFAULT_KEEP)))
    except (TypeError, ValueError):
        pass
    return settings


def save_settings(path: str, settings: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump({"extra_folder": settings.get("extra_folder") or None,
                   "keep": settings.get("keep", DEFAULT_KEEP)}, f, indent=2)


def run_backup(db_path: str, primary_dir: str, extra_folder: Optional[str] = None,
               keep: int = DEFAULT_KEEP, now: Optional[datetime] = None) -> dict:
    primary = create_backup(db_path, primary_dir, now=now)
    prune_backups(primary_dir, keep)

    extra, extra_error = None, None
    if extra_folder:
        if not os.path.isdir(extra_folder):
            extra_error = f"Backup folder not found: {extra_folder} (is the drive connected?)"
        else:
            try:
                extra_dir = os.path.join(extra_folder, EXTRA_SUBFOLDER)
                os.makedirs(extra_dir, exist_ok=True)
                extra = os.path.join(extra_dir, os.path.basename(primary))
                _atomic_write(lambda path: shutil.copy2(primary, path), extra)
                prune_backups(extra_dir, keep)
            except OSError as exc:
                extra, extra_error = None, f"Could not write to {extra_folder}: {exc}"

    return {"primary": primary, "extra": extra, "extra_error": extra_error}


# --- Scheduling -----------------------------------------------------------

_lock = threading.Lock()
last_error: Optional[str] = None
last_extra_error: Optional[str] = None


def backup_now(db_path: str) -> dict:
    """Run one backup with the saved settings. Serialised by a lock so the
    daily scheduler and a manual "Back up now" can't collide."""
    global last_error, last_extra_error
    settings = load_settings(settings_path())
    with _lock:
        try:
            result = run_backup(db_path, default_backup_dir(), settings["extra_folder"], settings["keep"])
        except Exception as exc:
            last_error = str(exc)
            raise
        last_error = None
        last_extra_error = result["extra_error"]
        return result


def start_scheduler(db_path: str, check_every_seconds: int = 3600) -> None:
    """Back up now if the newest snapshot is over a day old, then keep
    checking hourly for as long as the app is open."""
    def loop():
        while True:
            try:
                newest = list_backups(default_backup_dir())
                if is_backup_due(newest[0]["created_at"] if newest else None, datetime.now()):
                    result = backup_now(db_path)
                    logger.info("Automatic backup written to %s", result["primary"])
                    if result["extra_error"]:
                        logger.warning("Automatic backup extra copy failed: %s", result["extra_error"])
            except Exception:
                logger.exception("Automatic backup failed")
            time.sleep(check_every_seconds)

    threading.Thread(target=loop, name="auto-backup", daemon=True).start()
