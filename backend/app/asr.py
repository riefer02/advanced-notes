"""
Audio transcription using OpenAI GPT-4o-mini-transcribe.

Uses OpenAI's latest transcription model for easy deployment.
Model: gpt-4o-mini-transcribe-2025-12-15 (pinned snapshot; newer, higher quality than whisper-1)
"""

import os
import tempfile

from .services.openai_provider import get_openai_client, transcribe_model


def transcribe_bytes(audio_bytes: bytes, content_type: str = None):
    """
    Transcribe audio from raw bytes using OpenAI GPT-4o-mini-transcribe.

    Supports: mp3, mp4, mpeg, mpga, m4a, wav, webm (up to 25MB)

    Args:
        audio_bytes: Audio file bytes
        content_type: MIME type of audio (e.g., 'audio/webm', 'audio/mp4')

    Returns:
        tuple: (transcribed_text, metadata_dict)
    """
    # Validate input
    if not audio_bytes or len(audio_bytes) == 0:
        raise ValueError("Audio data is empty")

    if len(audio_bytes) < 1000:
        raise ValueError(
            "Audio data too small (less than 1KB), likely corrupted or too short"
        )

    if len(audio_bytes) > 25 * 1024 * 1024:  # 25MB limit
        raise ValueError("Audio file too large (max 25MB)")

    client = get_openai_client()

    # Map MIME types to file extensions
    mime_to_ext = {
        "audio/webm": ".webm",
        "audio/mp4": ".mp4",
        "audio/m4a": ".m4a",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/wav": ".wav",
        "audio/wave": ".wav",
        "audio/ogg": ".ogg",
        "audio/x-m4a": ".m4a",
    }

    # Get file extension from content type, default to .webm
    extension = ".webm"
    if content_type:
        # Handle content types with codecs (e.g., "audio/webm;codecs=opus")
        base_type = content_type.split(";")[0].strip().lower()
        extension = mime_to_ext.get(base_type, ".webm")

    print(
        f"Transcribing audio: size={len(audio_bytes)} bytes, type={content_type}, extension={extension}"
    )

    # OpenAI API requires a file object with a filename
    # Create temporary file with appropriate extension
    with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as temp_file:
        temp_file.write(audio_bytes)
        temp_path = temp_file.name

    try:
        # Call OpenAI GPT-4o-mini-transcribe API
        # Using json response format (text and verbose_json not supported by gpt-4o models)
        with open(temp_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                model=transcribe_model(),
                file=audio_file,
                response_format="json",  # gpt-4o models support json or text
            )

        # Extract text and metadata
        text = response.text

        meta = {
            "device": "openai-api",
            "model": transcribe_model(),
            "language": response.language if hasattr(response, "language") else None,
            "duration": response.duration if hasattr(response, "duration") else None,
            "duration_sec": response.duration
            if hasattr(response, "duration")
            else None,
        }

        return text, meta

    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.unlink(temp_path)
