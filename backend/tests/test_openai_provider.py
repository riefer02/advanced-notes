"""Tests that OpenAI clients are built with bounded timeout/retry settings."""

from app.config import Config
from app.services.openai_provider import build_openai_client, get_transcription_client


def test_client_uses_configured_timeout_and_retries():
    client = build_openai_client("sk-test", timeout=12.5)
    try:
        assert client.max_retries == Config.OPENAI_MAX_RETRIES
        assert float(client.timeout) == 12.5
    finally:
        client.close()


def test_transcription_client_uses_longer_timeout(monkeypatch):
    monkeypatch.setattr(Config, "OPENAI_API_KEY", "sk-test")
    get_transcription_client.cache_clear()
    try:
        client = get_transcription_client()
        assert float(client.timeout) == Config.OPENAI_TRANSCRIPTION_TIMEOUT_SECONDS
    finally:
        client.close()
        get_transcription_client.cache_clear()
