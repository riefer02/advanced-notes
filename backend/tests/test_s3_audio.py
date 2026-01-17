"""
Tests for S3 audio utility functions in app/services/s3_audio.py.

Tests pure utility functions and mocked boto3 operations.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services import s3_audio
from app.services.s3_audio import (
    ObjectHead,
    PresignedRequest,
    _MIME_TO_EXT,
    base_mime,
    delete_object,
    head_object,
    object_key_for_clip,
    presign_get_object,
    presign_put_object,
    put_object_bytes,
)


# ============================================================================
# base_mime
# ============================================================================


def test_base_mime_strips_codecs():
    """Strips codec parameters from MIME type."""
    result = base_mime("audio/webm;codecs=opus")
    assert result == "audio/webm"


def test_base_mime_lowercases():
    """Lowercases MIME type."""
    result = base_mime("AUDIO/WEBM")
    assert result == "audio/webm"


def test_base_mime_strips_whitespace():
    """Strips whitespace from MIME type."""
    result = base_mime("  audio/mp4  ")
    assert result == "audio/mp4"


def test_base_mime_empty_string():
    """Handles empty string."""
    result = base_mime("")
    assert result == ""


def test_base_mime_none_like():
    """Handles None-like values via empty string."""
    # The function signature expects str, but let's verify edge cases
    result = base_mime("")
    assert result == ""


def test_base_mime_complex_codecs():
    """Handles complex codec strings."""
    result = base_mime("audio/webm; codecs=opus; rate=48000")
    assert result == "audio/webm"


# ============================================================================
# _MIME_TO_EXT mapping validation
# ============================================================================


def test_mime_to_ext_has_common_types():
    """Verifies common MIME types are mapped."""
    assert _MIME_TO_EXT["audio/webm"] == ".webm"
    assert _MIME_TO_EXT["audio/mp4"] == ".mp4"
    assert _MIME_TO_EXT["audio/mpeg"] == ".mp3"
    assert _MIME_TO_EXT["audio/wav"] == ".wav"
    assert _MIME_TO_EXT["audio/ogg"] == ".ogg"


def test_mime_to_ext_m4a_variants():
    """Both m4a MIME types map to .m4a."""
    assert _MIME_TO_EXT["audio/m4a"] == ".m4a"
    assert _MIME_TO_EXT["audio/x-m4a"] == ".m4a"


def test_mime_to_ext_mp3_variants():
    """Both MP3 MIME types map to .mp3."""
    assert _MIME_TO_EXT["audio/mpeg"] == ".mp3"
    assert _MIME_TO_EXT["audio/mp3"] == ".mp3"


def test_mime_to_ext_wav_variants():
    """Both WAV MIME types map to .wav."""
    assert _MIME_TO_EXT["audio/wav"] == ".wav"
    assert _MIME_TO_EXT["audio/wave"] == ".wav"


# ============================================================================
# object_key_for_clip
# ============================================================================


def test_object_key_for_clip_with_prefix(monkeypatch):
    """Generates key with environment prefix."""
    monkeypatch.setattr(s3_audio.Config, "effective_s3_key_prefix", lambda: "dev")

    result = object_key_for_clip(
        user_id="user-123",
        clip_id="clip-456",
        mime_type="audio/mp4",
    )
    assert result == "dev/user-123/clip-456.mp4"


def test_object_key_for_clip_without_prefix(monkeypatch):
    """Generates key without prefix when empty."""
    monkeypatch.setattr(s3_audio.Config, "effective_s3_key_prefix", lambda: "")

    result = object_key_for_clip(
        user_id="user-123",
        clip_id="clip-456",
        mime_type="audio/mp4",
    )
    assert result == "user-123/clip-456.mp4"


def test_object_key_for_clip_unknown_mime(monkeypatch):
    """Unknown MIME type produces no extension."""
    monkeypatch.setattr(s3_audio.Config, "effective_s3_key_prefix", lambda: "")

    result = object_key_for_clip(
        user_id="user-123",
        clip_id="clip-456",
        mime_type="audio/unknown",
    )
    assert result == "user-123/clip-456"


def test_object_key_for_clip_with_codecs(monkeypatch):
    """MIME type with codecs is normalized."""
    monkeypatch.setattr(s3_audio.Config, "effective_s3_key_prefix", lambda: "")

    result = object_key_for_clip(
        user_id="user-123",
        clip_id="clip-456",
        mime_type="audio/webm;codecs=opus",
    )
    assert result == "user-123/clip-456.webm"


def test_object_key_for_clip_uppercase_mime(monkeypatch):
    """MIME type is lowercased for lookup."""
    monkeypatch.setattr(s3_audio.Config, "effective_s3_key_prefix", lambda: "")

    result = object_key_for_clip(
        user_id="user-123",
        clip_id="clip-456",
        mime_type="AUDIO/MPEG",
    )
    assert result == "user-123/clip-456.mp3"


# ============================================================================
# presign_put_object (mocked boto3)
# ============================================================================


def test_presign_put_object_returns_presigned_request(monkeypatch):
    """Returns PresignedRequest with correct fields."""
    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = "https://s3.example.com/signed-put"

    def mock_client_factory():
        return mock_client, "test-bucket"

    monkeypatch.setattr(s3_audio, "_client", mock_client_factory)

    result = presign_put_object(storage_key="user/clip.mp4", content_type="audio/mp4")

    assert isinstance(result, PresignedRequest)
    assert result.url == "https://s3.example.com/signed-put"
    assert result.method == "PUT"
    assert result.headers["Content-Type"] == "audio/mp4"
    assert result.expires_at  # Should have an expiration


def test_presign_put_object_calls_boto3_correctly(monkeypatch):
    """Verifies boto3 is called with correct parameters."""
    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = "https://s3.example.com/url"

    def mock_client_factory():
        return mock_client, "my-bucket"

    monkeypatch.setattr(s3_audio, "_client", mock_client_factory)

    presign_put_object(storage_key="path/to/file.mp3", content_type="audio/mpeg")

    mock_client.generate_presigned_url.assert_called_once()
    call_args = mock_client.generate_presigned_url.call_args
    assert call_args.kwargs["ClientMethod"] == "put_object"
    assert call_args.kwargs["Params"]["Bucket"] == "my-bucket"
    assert call_args.kwargs["Params"]["Key"] == "path/to/file.mp3"
    assert call_args.kwargs["Params"]["ContentType"] == "audio/mpeg"


# ============================================================================
# presign_get_object (mocked boto3)
# ============================================================================


def test_presign_get_object_returns_presigned_request(monkeypatch):
    """Returns PresignedRequest with correct fields for GET."""
    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = "https://s3.example.com/signed-get"

    def mock_client_factory():
        return mock_client, "test-bucket"

    monkeypatch.setattr(s3_audio, "_client", mock_client_factory)

    result = presign_get_object(storage_key="user/clip.mp4")

    assert isinstance(result, PresignedRequest)
    assert result.url == "https://s3.example.com/signed-get"
    assert result.method == "GET"
    assert result.headers == {}  # No headers required for GET


def test_presign_get_object_calls_boto3_correctly(monkeypatch):
    """Verifies boto3 is called with correct parameters."""
    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = "https://s3.example.com/url"

    def mock_client_factory():
        return mock_client, "my-bucket"

    monkeypatch.setattr(s3_audio, "_client", mock_client_factory)

    presign_get_object(storage_key="path/to/file.mp3")

    mock_client.generate_presigned_url.assert_called_once()
    call_args = mock_client.generate_presigned_url.call_args
    assert call_args.kwargs["ClientMethod"] == "get_object"
    assert call_args.kwargs["Params"]["Bucket"] == "my-bucket"
    assert call_args.kwargs["Params"]["Key"] == "path/to/file.mp3"


# ============================================================================
# head_object (mocked boto3)
# ============================================================================


def test_head_object_returns_object_head(monkeypatch):
    """Returns ObjectHead with content info."""
    mock_client = MagicMock()
    mock_client.head_object.return_value = {
        "ContentLength": 12345,
        "ContentType": "audio/mp4",
    }

    def mock_client_factory():
        return mock_client, "test-bucket"

    monkeypatch.setattr(s3_audio, "_client", mock_client_factory)

    result = head_object(storage_key="user/clip.mp4")

    assert isinstance(result, ObjectHead)
    assert result.content_length == 12345
    assert result.content_type == "audio/mp4"


def test_head_object_requires_storage_key():
    """Raises ValueError for empty storage key."""
    with pytest.raises(ValueError, match="storage_key is required"):
        head_object(storage_key="")


def test_head_object_handles_missing_content_type(monkeypatch):
    """Handles missing ContentType gracefully."""
    mock_client = MagicMock()
    mock_client.head_object.return_value = {
        "ContentLength": 1000,
        # ContentType missing
    }

    def mock_client_factory():
        return mock_client, "test-bucket"

    monkeypatch.setattr(s3_audio, "_client", mock_client_factory)

    result = head_object(storage_key="user/clip")

    assert result.content_length == 1000
    assert result.content_type is None


# ============================================================================
# put_object_bytes (mocked boto3)
# ============================================================================


def test_put_object_bytes_uploads_data(monkeypatch):
    """Successfully uploads bytes to S3."""
    mock_client = MagicMock()

    def mock_client_factory():
        return mock_client, "test-bucket"

    monkeypatch.setattr(s3_audio, "_client", mock_client_factory)

    put_object_bytes(
        storage_key="user/clip.mp4",
        content_type="audio/mp4",
        data=b"test audio bytes",
    )

    mock_client.put_object.assert_called_once_with(
        Bucket="test-bucket",
        Key="user/clip.mp4",
        Body=b"test audio bytes",
        ContentType="audio/mp4",
    )


def test_put_object_bytes_rejects_empty_data():
    """Raises ValueError for empty data."""
    with pytest.raises(ValueError, match="Cannot upload empty object"):
        put_object_bytes(
            storage_key="user/clip.mp4",
            content_type="audio/mp4",
            data=b"",
        )


def test_put_object_bytes_rejects_none_data():
    """Raises ValueError for None data."""
    with pytest.raises(ValueError, match="Cannot upload empty object"):
        put_object_bytes(
            storage_key="user/clip.mp4",
            content_type="audio/mp4",
            data=None,
        )


# ============================================================================
# delete_object (mocked boto3)
# ============================================================================


def test_delete_object_calls_boto3(monkeypatch):
    """Calls boto3 delete_object with correct params."""
    mock_client = MagicMock()

    def mock_client_factory():
        return mock_client, "test-bucket"

    monkeypatch.setattr(s3_audio, "_client", mock_client_factory)

    delete_object(storage_key="user/clip.mp4")

    mock_client.delete_object.assert_called_once_with(
        Bucket="test-bucket",
        Key="user/clip.mp4",
    )


def test_delete_object_requires_storage_key():
    """Raises ValueError for empty storage key."""
    with pytest.raises(ValueError, match="storage_key is required"):
        delete_object(storage_key="")


# ============================================================================
# _require_s3_config
# ============================================================================


def test_require_s3_config_raises_without_bucket(monkeypatch):
    """Raises ValueError when S3_BUCKET is not set."""
    monkeypatch.setattr(s3_audio.Config, "S3_BUCKET", None)

    with pytest.raises(ValueError, match="S3_BUCKET is required"):
        s3_audio._require_s3_config()


def test_require_s3_config_returns_tuple(monkeypatch):
    """Returns tuple of config values when bucket is set."""
    monkeypatch.setattr(s3_audio.Config, "S3_BUCKET", "my-bucket")
    monkeypatch.setattr(s3_audio.Config, "AWS_REGION", "us-east-1")
    monkeypatch.setattr(s3_audio.Config, "AWS_ACCESS_KEY_ID", "AKIA...")
    monkeypatch.setattr(s3_audio.Config, "AWS_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setattr(s3_audio.Config, "S3_ENDPOINT_URL", None)

    result = s3_audio._require_s3_config()

    assert result[0] == "my-bucket"
    assert result[1] == "us-east-1"
    assert result[2] == "AKIA..."
    assert result[3] == "secret"
    assert result[4] is None
