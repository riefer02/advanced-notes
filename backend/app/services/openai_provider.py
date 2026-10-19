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
) -> OpenAI:
    key = api_key or Config.OPENAI_API_KEY
    if not key:
        raise ValueError("OPENAI_API_KEY is required for OpenAI-backed features")
    return OpenAI(
        api_key=key,
        timeout=timeout or Config.OPENAI_TIMEOUT_SECONDS,
        max_retries=Config.OPENAI_MAX_RETRIES,
    )


@lru_cache(maxsize=1)
def get_openai_client() -> OpenAI:
    return build_openai_client()


@lru_cache(maxsize=1)
def get_transcription_client() -> OpenAI:
    return build_openai_client(timeout=Config.OPENAI_TRANSCRIPTION_TIMEOUT_SECONDS)


def chat_model() -> str:
    return Config.OPENAI_MODEL


def embedding_model() -> str:
    # Default is set in Config; override via OPENAI_EMBEDDING_MODEL.
    return getattr(Config, "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")


def transcribe_model() -> str:
    return Config.WHISPER_MODEL
