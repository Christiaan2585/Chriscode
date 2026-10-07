import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core import backup
from app.core.db import create_db_and_tables, database_file_path, engine
from app.core.security import require_admin

# Admin-only as a whole, not just the settings endpoint: backups are pruned
# to the newest N, so anyone able to trigger them repeatedly could push out
# every older restore point (e.g. delete records, then evict the backups
# taken before the deletion).
router = APIRouter(prefix="/backups", tags=["Backups"], dependencies=[Depends(require_admin)])


class BackupSettings(BaseModel):
    extra_folder: Optional[str] = None
    keep: int = Field(default=backup.DEFAULT_KEEP, ge=1, le=365)


def _status() -> dict:
    settings = backup.load_settings(backup.settings_path())
    extra_dir = (os.path.join(settings["extra_folder"], backup.EXTRA_SUBFOLDER)
                 if settings["extra_folder"] else None)
    return {
        "backup_dir": backup.default_backup_dir(),
        "extra_backup_dir": extra_dir,
        "settings": settings,
        "backups": [
            {"name": b["name"], "size": b["size"], "created_at": b["created_at"], "encrypted": b["encrypted"]}
            for b in backup.list_backups(backup.default_backup_dir())
        ],
        "last_error": backup.last_error,
        "last_extra_error": backup.last_extra_error,
    }


@router.get("/")
def get_backup_status():
    return _status()


@router.post("/run")
def run_backup_now():
    try:
        backup.backup_now(database_file_path())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}")
    return _status()


class RestoreRequest(BaseModel):
    name: str
    passphrase: Optional[str] = Field(default=None, max_length=200)  # for a locked backup, if this PC doesn't have it saved


@router.post("/restore")
def restore_backup(payload: RestoreRequest):
    try:
        backup.restore(database_file_path(), payload.name, payload.passphrase)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    # Pooled connections may hold cached schema from before the swap, and
    # an older backup can predate columns this version expects - drop the
    # pool and re-run the schema sync against the restored data.
    engine.dispose()
    create_db_and_tables()
    return _status()


class EncryptionRequest(BaseModel):
    passphrase: str = Field(max_length=200)


@router.put("/encryption")
def set_encryption(payload: EncryptionRequest):
    """Locks every backup from now on with this passphrase (old ones stay as they were)."""
    try:
        backup.set_passphrase(backup.settings_path(), payload.passphrase)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return _status()


@router.delete("/encryption")
def clear_encryption():
    """Back to unlocked backups. Locked ones already made still need the passphrase."""
    backup.set_passphrase(backup.settings_path(), None)
    return _status()


@router.put("/settings")
def update_backup_settings(payload: BackupSettings):
    folder = (payload.extra_folder or "").strip() or None
    if folder and (not os.path.isabs(folder) or not os.path.isdir(folder)):
        raise HTTPException(status_code=400, detail=f"Folder not found: {folder}")
    backup.save_settings(backup.settings_path(), {"extra_folder": folder, "keep": payload.keep})
    return _status()
