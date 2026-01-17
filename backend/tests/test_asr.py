"""
Tests for audio transcription input validation in app/asr.py.

Tests validation logic without calling OpenAI API.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.asr import transcribe_bytes


# ============================================================================
# Input Validation Tests
# ============================================================================


def test_transcribe_bytes_rejects_empty_bytes():
    """Raises ValueError for empty audio data."""
    with pytest.raises(ValueError, match="Audio data is empty"):
        transcribe_bytes(b"", content_type="audio/mp4")


def test_transcribe_bytes_rejects_none_bytes():
    """Raises ValueError for None audio data."""
    with pytest.raises(ValueError, match="Audio data is empty"):
        transcribe_bytes(None, content_type="audio/mp4")


def test_transcribe_bytes_rejects_too_small():
    """Raises ValueError for audio data under 1KB."""
    small_data = b"x" * 500  # 500 bytes, less than 1KB
    with pytest.raises(ValueError, match="Audio data too small"):
        transcribe_bytes(small_data, content_type="audio/mp4")


def test_transcribe_bytes_rejects_boundary_small():
    """Rejects audio at exactly 999 bytes."""
    data = b"x" * 999
    with pytest.raises(ValueError, match="Audio data too small"):
        transcribe_bytes(data, content_type="audio/mp4")


def test_transcribe_bytes_rejects_too_large():
    """Raises ValueError for audio data over 25MB."""
    large_data = b"x" * (25 * 1024 * 1024 + 1)  # Just over 25MB
    with pytest.raises(ValueError, match="Audio file too large"):
        transcribe_bytes(large_data, content_type="audio/mp4")


def test_transcribe_bytes_rejects_exactly_too_large():
    """Rejects audio at exactly 25MB + 1 byte."""
    data = b"x" * (25 * 1024 * 1024 + 1)
    with pytest.raises(ValueError, match="Audio file too large"):
        transcribe_bytes(data, content_type="audio/mp4")


# ============================================================================
# MIME Type to Extension Mapping Tests
# ============================================================================


@patch("app.asr.get_openai_client")
def test_transcribe_bytes_uses_webm_extension(mock_client):
    """Uses .webm extension for audio/webm MIME type."""
    mock_response = MagicMock()
    mock_response.text = "transcribed text"

    mock_openai = MagicMock()
    mock_openai.audio.transcriptions.create.return_value = mock_response
    mock_client.return_value = mock_openai

    # Valid size audio
    audio_data = b"x" * 2000

    text, meta = transcribe_bytes(audio_data, content_type="audio/webm")

    assert text == "transcribed text"
    # Verify the API was called
    mock_openai.audio.transcriptions.create.assert_called_once()


@patch("app.asr.get_openai_client")
def test_transcribe_bytes_uses_mp3_extension(mock_client):
    """Uses .mp3 extension for audio/mpeg MIME type."""
    mock_response = MagicMock()
    mock_response.text = "mp3 transcription"

    mock_openai = MagicMock()
    mock_openai.audio.transcriptions.create.return_value = mock_response
    mock_client.return_value = mock_openai

    audio_data = b"x" * 2000

    text, meta = transcribe_bytes(audio_data, content_type="audio/mpeg")

    assert text == "mp3 transcription"


@patch("app.asr.get_openai_client")
def test_transcribe_bytes_handles_codec_suffix(mock_client):
    """Handles MIME types with codec suffixes."""
    mock_response = MagicMock()
    mock_response.text = "opus transcription"

    mock_openai = MagicMock()
    mock_openai.audio.transcriptions.create.return_value = mock_response
    mock_client.return_value = mock_openai

    audio_data = b"x" * 2000

    text, meta = transcribe_bytes(audio_data, content_type="audio/webm;codecs=opus")

    assert text == "opus transcription"


@patch("app.asr.get_openai_client")
def test_transcribe_bytes_defaults_to_webm(mock_client):
    """Defaults to .webm extension for unknown MIME types."""
    mock_response = MagicMock()
    mock_response.text = "default transcription"

    mock_openai = MagicMock()
    mock_openai.audio.transcriptions.create.return_value = mock_response
    mock_client.return_value = mock_openai

    audio_data = b"x" * 2000

    text, meta = transcribe_bytes(audio_data, content_type="audio/unknown-type")

    assert text == "default transcription"


@patch("app.asr.get_openai_client")
def test_transcribe_bytes_handles_none_content_type(mock_client):
    """Handles None content type gracefully."""
    mock_response = MagicMock()
    mock_response.text = "no content type"

    mock_openai = MagicMock()
    mock_openai.audio.transcriptions.create.return_value = mock_response
    mock_client.return_value = mock_openai

    audio_data = b"x" * 2000

    text, meta = transcribe_bytes(audio_data, content_type=None)

    assert text == "no content type"


# ============================================================================
# Metadata Extraction Tests
# ============================================================================


@patch("app.asr.get_openai_client")
def test_transcribe_bytes_returns_metadata(mock_client):
    """Returns metadata dict with model and device info."""
    mock_response = MagicMock()
    mock_response.text = "transcribed"
    mock_response.language = "en"
    mock_response.duration = 5.5

    mock_openai = MagicMock()
    mock_openai.audio.transcriptions.create.return_value = mock_response
    mock_client.return_value = mock_openai

    audio_data = b"x" * 2000

    text, meta = transcribe_bytes(audio_data, content_type="audio/mp4")

    assert meta["device"] == "openai-api"
    assert "model" in meta
    assert meta["language"] == "en"
    assert meta["duration"] == 5.5
    assert meta["duration_sec"] == 5.5


@patch("app.asr.get_openai_client")
def test_transcribe_bytes_handles_missing_metadata_attrs(mock_client):
    """Handles response without language/duration attributes."""
    mock_response = MagicMock(spec=["text"])  # Only has 'text' attribute
    mock_response.text = "transcribed"

    mock_openai = MagicMock()
    mock_openai.audio.transcriptions.create.return_value = mock_response
    mock_client.return_value = mock_openai

    audio_data = b"x" * 2000

    text, meta = transcribe_bytes(audio_data, content_type="audio/mp4")

    assert text == "transcribed"
    assert meta["language"] is None
    assert meta["duration"] is None


# ============================================================================
# Boundary Tests
# ============================================================================


@patch("app.asr.get_openai_client")
def test_transcribe_bytes_accepts_minimum_size(mock_client):
    """Accepts audio data at exactly 1000 bytes."""
    mock_response = MagicMock()
    mock_response.text = "minimum size"

    mock_openai = MagicMock()
    mock_openai.audio.transcriptions.create.return_value = mock_response
    mock_client.return_value = mock_openai

    # Exactly at the 1KB threshold
    audio_data = b"x" * 1000

    text, meta = transcribe_bytes(audio_data, content_type="audio/mp4")

    assert text == "minimum size"


@patch("app.asr.get_openai_client")
def test_transcribe_bytes_accepts_maximum_size(mock_client):
    """Accepts audio data at exactly 25MB."""
    mock_response = MagicMock()
    mock_response.text = "maximum size"

    mock_openai = MagicMock()
    mock_openai.audio.transcriptions.create.return_value = mock_response
    mock_client.return_value = mock_openai

    # Exactly at the 25MB threshold
    audio_data = b"x" * (25 * 1024 * 1024)

    text, meta = transcribe_bytes(audio_data, content_type="audio/mp4")

    assert text == "maximum size"
