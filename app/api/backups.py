import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core import backup
from app.core.db import database_file_path
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
            {"name": b["name"], "size": b["size"], "created_at": b["created_at"]}
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


@router.put("/settings")
def update_backup_settings(payload: BackupSettings):
    folder = (payload.extra_folder or "").strip() or None
    if folder and (not os.path.isabs(folder) or not os.path.isdir(folder)):
        raise HTTPException(status_code=400, detail=f"Folder not found: {folder}")
    backup.save_settings(backup.settings_path(), {"extra_folder": folder, "keep": payload.keep})
    return _status()
