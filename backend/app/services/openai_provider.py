"""
Centralized OpenAI client + model configuration.

This keeps AI-related configuration DRY and consistent across endpoints/services.
"""

from __future__ import annotations

from functools import lru_cache

from openai import OpenAI

from app.config import Config


@lru_cache(maxsize=1)
def get_openai_client() -> OpenAI:
    if not Config.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is required for OpenAI-backed features")
    return OpenAI(api_key=Config.OPENAI_API_KEY)


def chat_model() -> str:
    return Config.OPENAI_MODEL


def embedding_model() -> str:
    # Default is set in Config; override via OPENAI_EMBEDDING_MODEL.
    return getattr(Config, "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")


def transcribe_model() -> str:
    return Config.WHISPER_MODEL


