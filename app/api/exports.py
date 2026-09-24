import io
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.db import database_file_path
from app.core.export import build_workbook
from app.core.security import require_admin

# Admin-only: it's every client, animal and invoice in one portable file.
router = APIRouter(prefix="/exports", tags=["Exports"], dependencies=[Depends(require_admin)])


@router.get("/workbook")
def export_workbook():
    buffer = io.BytesIO()
    build_workbook(database_file_path()).save(buffer)
    buffer.seek(0)
    filename = f"sandveld-export-{date.today().isoformat()}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
