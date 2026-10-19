"""Content sniffing for uploaded files.

Multipart ``Content-Type`` headers are client-controlled, so validate the
bytes themselves before storing or forwarding an upload.
"""

from __future__ import annotations

# Magic prefixes for the image formats we accept.
_IMAGE_MAGIC: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)

# ISO base media brands that identify HEIC/HEIF images.
_HEIF_BRANDS = {b"heic", b"heix", b"heif", b"mif1"}


def normalize_mime(mime: str | None) -> str:
    """Normalize a declared MIME type (drop parameters, lowercase, alias jpg)."""
    value = (mime or "").split(";")[0].strip().lower()
    return "image/jpeg" if value == "image/jpg" else value


def sniff_image_mime(data: bytes) -> str | None:
    """Return the image MIME type implied by magic bytes, or None if unknown."""
    if not data:
        return None

    for signature, mime in _IMAGE_MAGIC:
        if data.startswith(signature):
            return mime

    # WebP: RIFF container with a WEBP form type.
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"

    # HEIC/HEIF: ISO base media file with a known brand.
    if len(data) >= 12 and data[4:8] == b"ftyp" and data[8:12] in _HEIF_BRANDS:
        return "image/heic"

    return None


def image_matches_declared_type(data: bytes, declared_mime: str | None) -> bool:
    """True when the payload's magic bytes agree with the declared type."""
    sniffed = sniff_image_mime(data)
    return sniffed is not None and sniffed == normalize_mime(declared_mime)
