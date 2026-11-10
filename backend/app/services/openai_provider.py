"""
Centralized OpenAI client + model configuration.

This keeps AI-related configuration DRY and consistent across endpoints/services.
Every client is built with an explicit timeout and retry budget: the SDK
default timeout is 10 minutes, which can pin sync gunicorn workers.
"""

from __future__ import annotations

from functools import lru_cache

from openai import OpenAI

from app.config import Config


def build_openai_client(
    api_key: str | None = None,
    *,
    timeout: float | None = None,
    max_retries: int | None = None,
) -> OpenAI:
    key = api_key or Config.OPENAI_API_KEY
    if not key:
        raise ValueError("OPENAI_API_KEY is required for OpenAI-backed features")
    return OpenAI(
        api_key=key,
        timeout=timeout or Config.OPENAI_TIMEOUT_SECONDS,
        max_retries=Config.OPENAI_MAX_RETRIES if max_retries is None else max_retries,
    )


@lru_cache(maxsize=1)
def get_openai_client() -> OpenAI:
    return build_openai_client()


@lru_cache(maxsize=1)
def get_transcription_client() -> OpenAI:
    # Transcription is the longest single call; do not retry it inside the
    # request budget. A failed upload is retried by the user with the blob
    # still available in the UI.
    return build_openai_client(
        timeout=Config.OPENAI_TRANSCRIPTION_TIMEOUT_SECONDS,
        max_retries=0,
    )


def chat_model() -> str:
    return Config.OPENAI_MODEL


# Models that document `reasoning_effort="none"`. GPT-6 Astra, GPT-6.1 Sol,
# o-series, and gpt-4o* either reject "none" or don't accept the parameter.
_NONE_REASONING_MODEL_PREFIXES = ("gpt-6-luna", "gpt-6.1-terra", "gpt-6-sol")


def chat_reasoning_extra_body(model: str | None = None) -> dict[str, object] | None:
    """Return the configured reasoning effort only for models that accept it.

    The default ("none") keeps short structured-output calls fast and allows
    `temperature`; the API rejects custom temperature when reasoning effort is
    anything else. Only GPT-6 Luna, GPT-6.1 Terra, and GPT-6 Sol document
    "none" support. Other models get no override and keep their default effort
    instead of receiving an invalid "none" (Astra/Sol) or an unsupported
    parameter (gpt-4o*).

    Sent through ``extra_body`` because the installed OpenAI SDK (2.7.1)
    predates the "none" effort level and doesn't include it in its Literal type.
    """
    resolved = model or chat_model()
    if resolved.startswith(_NONE_REASONING_MODEL_PREFIXES):
        return {"reasoning_effort": Config.OPENAI_REASONING_EFFORT}
    return None


def embedding_model() -> str:
    # Default is set in Config; override via OPENAI_EMBEDDING_MODEL.
    return getattr(Config, "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")


def transcribe_model() -> str:
    return Config.TRANSCRIBE_MODEL
