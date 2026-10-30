"""
Audio transcription using OpenAI gpt-transcribe.

gpt-transcribe is the current file-transcription model. The
gpt-4o-*-transcribe family it replaces shuts down on 2027-02-26.
"""

import logging
import os
import re
import tempfile

from .services.openai_provider import get_transcription_client, transcribe_model

logger = logging.getLogger(__name__)

_LANGUAGE_CODE_RE = re.compile(r"^[a-z]{2,3}(?:-[a-z]{2,4})?$")
_KEYWORD_BAD_CHARS_RE = re.compile(r"[<>\r\n]")


def _clean_keywords(keywords: list[str] | None) -> list[str]:
    """Normalize keyword hints and drop values the API rejects."""
    cleaned: list[str] = []
    seen: set[str] = set()
    for keyword in keywords or []:
        term = str(keyword).strip()
        if not term or len(term) > 80 or _KEYWORD_BAD_CHARS_RE.search(term):
            continue
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(term)
        if len(cleaned) >= 40:
            break
    return cleaned


def _clean_languages(languages: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    for language in languages or []:
        code = str(language).strip().lower()
        if _LANGUAGE_CODE_RE.fullmatch(code) and code not in cleaned:
            cleaned.append(code)
        if len(cleaned) >= 5:
            break
    return cleaned


def _duration_seconds(response: object) -> float | None:
    """Read billed audio duration from the response usage object.

    gpt-transcribe is billed per minute and returns
    ``usage: {"type": "duration", "seconds": ...}``. Token-billed models carry
    no audio duration, so return None instead of inventing a value.
    """
    usage = getattr(response, "usage", None)
    if isinstance(usage, dict):
        if usage.get("type") != "duration":
            return None
        seconds = usage.get("seconds")
    else:
        if usage is None or getattr(usage, "type", None) != "duration":
            return None
        seconds = getattr(usage, "seconds", None)
    if seconds is None:
        return None
    try:
        return float(seconds)
    except (TypeError, ValueError):
        logger.warning("Transcription usage had an invalid duration: %r", seconds)
        return None


def _detected_language(response: object) -> str | None:
    """Return the first detected language code, if the model reported one."""
    languages = getattr(response, "languages", None) or []
    if not languages:
        return None
    first = languages[0]
    if isinstance(first, dict):
        return first.get("code")
    return getattr(first, "code", None)


def transcribe_bytes(
    audio_bytes: bytes,
    content_type: str | None = None,
    *,
    prompt: str | None = None,
    keywords: list[str] | None = None,
    languages: list[str] | None = None,
) -> tuple[str, dict[str, str | float | None]]:
    """
    Transcribe audio from raw bytes using OpenAI gpt-transcribe.

    Supports: mp3, mp4, mpeg, mpga, m4a, wav, webm (up to 25MB)

    Args:
        audio_bytes: Audio file bytes
        content_type: MIME type of audio (e.g., 'audio/webm', 'audio/mp4')
        prompt: Optional context about the recording (not instructions)
        keywords: Optional literal terms likely to appear (names, acronyms)
        languages: Optional expected input language codes

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

    # Transcription uploads can be large; use the longer, still-bounded timeout.
    client = get_transcription_client()

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
        model = transcribe_model()
        context: dict[str, object] = {}
        clean_prompt = (prompt or "").strip()
        if clean_prompt:
            context["prompt"] = clean_prompt[:500]
        clean_keywords = _clean_keywords(keywords)
        if clean_keywords:
            context["keywords"] = clean_keywords
        clean_languages = _clean_languages(languages)
        if clean_languages:
            context["languages"] = clean_languages

        # gpt-transcribe defaults to json; keep it explicit so we get the
        # structured Transcription object (text + languages + usage).
        # prompt/keywords/languages are newer than the pinned SDK, so pass
        # them through extra_body.
        with open(temp_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                model=model,
                file=audio_file,
                response_format="json",
                extra_body=context or None,
            )

        # Extract text and metadata
        text = response.text
        duration = _duration_seconds(response)
        if duration is None:
            logger.warning(
                "Transcription response for %s had no duration usage; "
                "quota and cost tracking will be skipped",
                model,
            )

        meta = {
            "device": "openai-api",
            "model": model,
            "language": _detected_language(response),
            "duration": duration,
            "duration_sec": duration,
        }

        return text, meta

    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.unlink(temp_path)
