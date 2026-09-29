"""Turns an uploaded picture into what's stored: a modest JPEG plus a
thumbnail. Re-encoding also drops anything that isn't pixels - EXIF data
(camera details, GPS location), embedded scripts in odd formats, etc."""
import io

from PIL import Image, ImageOps

MAX_SIZE = 800
THUMB_SIZE = 160
AVATAR_SIZE = 256
# A small file can still claim to be an enormous image ("decompression
# bomb"); Pillow refuses anything above this many pixels.
Image.MAX_IMAGE_PIXELS = 50_000_000


class NotAnImage(ValueError):
    pass


def _jpeg(img, size, quality):
    copy = img.copy()
    copy.thumbnail((size, size))  # only ever shrinks
    out = io.BytesIO()
    copy.save(out, format="JPEG", quality=quality, optimize=True)
    return out.getvalue()


def process_image(data: bytes) -> tuple:
    """(image, thumbnail) JPEG bytes, or NotAnImage."""
    img = _decode(data)
    return _jpeg(img, MAX_SIZE, 82), _jpeg(img, THUMB_SIZE, 75)


def process_avatar(data: bytes) -> bytes:
    """A profile photo: the middle square of the picture as a JPEG, at most
    AVATAR_SIZE across (a small photo isn't blown up). NotAnImage otherwise."""
    img = _decode(data)
    side = min(img.size)
    square = ImageOps.fit(img, (side, side))
    return _jpeg(square, AVATAR_SIZE, 80)


def _decode(data: bytes):
    """The picture as plain RGB pixels, turned upright, or NotAnImage."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.load()
            img = ImageOps.exif_transpose(img)  # phone photos taken sideways
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGBA")
                flat = Image.new("RGB", img.size, "white")
                flat.paste(img, mask=img.getchannel("A"))
                img = flat
            else:
                img = img.convert("RGB")
    except (Image.DecompressionBombError, OSError, ValueError, SyntaxError) as exc:
        raise NotAnImage(str(exc)) from exc
    return img
