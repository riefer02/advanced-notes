"""Tests for upload content sniffing."""

from app.services.file_validation import (
    image_matches_declared_type,
    normalize_mime,
    sniff_image_mime,
)

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBPVP8 " + b"\x00" * 16
HEIC = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 16


def test_sniff_known_image_types():
    assert sniff_image_mime(JPEG) == "image/jpeg"
    assert sniff_image_mime(PNG) == "image/png"
    assert sniff_image_mime(WEBP) == "image/webp"
    assert sniff_image_mime(HEIC) == "image/heic"


def test_sniff_rejects_non_images():
    assert sniff_image_mime(b"<html><body>hi</body></html>") is None
    assert sniff_image_mime(b"") is None
    assert sniff_image_mime(b"%PDF-1.7") is None


def test_declared_type_must_match_magic_bytes():
    assert image_matches_declared_type(JPEG, "image/jpeg")
    assert image_matches_declared_type(PNG, "image/png")
    # A lie about the type is rejected.
    assert not image_matches_declared_type(PNG, "image/jpeg")
    assert not image_matches_declared_type(b"<html>", "image/png")


def test_normalize_mime_handles_parameters_and_jpg_alias():
    assert normalize_mime("image/JPEG; charset=binary") == "image/jpeg"
    assert normalize_mime("image/jpg") == "image/jpeg"
    assert normalize_mime(None) == ""
