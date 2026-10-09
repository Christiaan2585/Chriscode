from fastapi import HTTPException, UploadFile

IMPORT_LIMIT_BYTES = 10 * 1024 * 1024  # a price list or client list is a few hundred KB; this leaves room


async def read_capped(file: UploadFile, limit: int = IMPORT_LIMIT_BYTES) -> bytes:
    """The upload's bytes, or a 413 if it is bigger than `limit` (read one byte past it, never the whole thing)."""
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"That file is over {limit // (1024 * 1024)} MB - please use a smaller one")
    return data
