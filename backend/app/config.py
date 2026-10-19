"""
Configuration management for the application.

Loads environment variables and provides centralized config access.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


# ============================================================================
# CONSTANTS - Magic numbers extracted for clarity
# ============================================================================


class SearchConfig:
    """Configuration constants for search operations."""
    MAX_SEMANTIC_CANDIDATES = 200
    MAX_FTS_CANDIDATES = 200
    MAX_ASK_RESULTS = 50
    DEFAULT_ASK_RESULTS = 12
    STALE_CLIP_MINUTES = 60
    STALE_CLIP_BATCH_SIZE = 100


class PaginationConfig:
    """Configuration constants for pagination."""
    DEFAULT_LIMIT = 50
    MAX_LIMIT = 100
    TODO_DEFAULT_LIMIT = 100
    TODO_MAX_LIMIT = 200


class ContentConfig:
    """Configuration constants for content processing."""
    MAX_TITLE_LENGTH = 500
    MAX_DESCRIPTION_LENGTH = 2000
    MAX_QUERY_LENGTH = 2000
    CONTENT_EXCERPT_LENGTH = 2000
    SNIPPET_LENGTH = 220


class Config:
    """Application configuration"""

    # Request body limits (bytes). Global cap applies to every request; the
    # per-endpoint caps below are enforced by routes before/while reading.
    MAX_CONTENT_LENGTH: int = int(os.getenv("MAX_CONTENT_LENGTH", str(26 * 1024 * 1024)))
    MAX_AUDIO_BYTES: int = 25 * 1024 * 1024  # OpenAI transcription limit
    MAX_IMAGE_BYTES: int = 6 * 1024 * 1024  # per vinyl image
    MAX_AVATAR_BYTES: int = 1 * 1024 * 1024  # per avatar image

    # External call timeouts / retries. Every client must be bounded so a
    # hung provider cannot pin sync gunicorn workers indefinitely.
    OPENAI_TIMEOUT_SECONDS: float = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "45"))
    OPENAI_TRANSCRIPTION_TIMEOUT_SECONDS: float = float(
        os.getenv("OPENAI_TRANSCRIPTION_TIMEOUT_SECONDS", "120")
    )
    OPENAI_MAX_RETRIES: int = int(os.getenv("OPENAI_MAX_RETRIES", "2"))
    # Must match the pgvector column width used by the embedding tables.
    EMBEDDING_DIMENSIONS: int = int(os.getenv("EMBEDDING_DIMENSIONS", "1536"))
    JWKS_TIMEOUT_SECONDS: float = float(os.getenv("JWKS_TIMEOUT_SECONDS", "5"))
    JWKS_ATTEMPTS: int = int(os.getenv("JWKS_ATTEMPTS", "2"))

    # Database pool / connect bounds.
    DB_CONNECT_TIMEOUT_SECONDS: int = int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "5"))
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "5"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "10"))
    DB_POOL_TIMEOUT_SECONDS: int = int(os.getenv("DB_POOL_TIMEOUT_SECONDS", "10"))
    DB_POOL_RECYCLE_SECONDS: int = int(os.getenv("DB_POOL_RECYCLE_SECONDS", "1800"))
    SQLITE_LOCK_TIMEOUT_SECONDS: int = int(os.getenv("SQLITE_LOCK_TIMEOUT_SECONDS", "15"))

    # Flask settings
    FLASK_ENV: str = os.getenv("FLASK_ENV", "development")
    DEBUG: bool = FLASK_ENV == "development"
    # Generic environment name (preferred for non-Flask deployments).
    # Use APP_ENV (recommended) or ENV; falls back to FLASK_ENV.
    APP_ENV: str | None = os.getenv("APP_ENV") or os.getenv("ENV")

    # OpenAI settings (used for both transcription and GPT categorization)
    OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    OPENAI_EMBEDDING_MODEL: str = os.getenv(
        "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
    )

    # Transcription settings
    # Using a pinned snapshot for stability/reproducibility across deploys.
    # (Newer, higher quality than whisper-1)
    WHISPER_MODEL: str = "gpt-4o-mini-transcribe-2025-12-15"

    # Storage settings (database-only, no file system storage)
    BASE_DIR: Path = Path(__file__).parent.parent  # backend/
    DB_PATH: Path = BASE_DIR / ".notes.db"

    # Categorization settings
    CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.7"))
    DEFAULT_FOLDERS: list = ["inbox", "archive"]
    MAX_NOTES_PER_FOLDER: int = 50

    # Object storage (S3) settings for audio clips
    S3_BUCKET: str | None = os.getenv("S3_BUCKET")
    AWS_REGION: str | None = os.getenv("AWS_REGION")
    AWS_ACCESS_KEY_ID: str | None = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: str | None = os.getenv("AWS_SECRET_ACCESS_KEY")
    # Optional override (useful for S3-compatible endpoints like MinIO/R2)
    S3_ENDPOINT_URL: str | None = os.getenv("S3_ENDPOINT_URL")
    # Optional prefix to isolate objects by environment within a single bucket.
    # If unset, we default to APP_ENV/ENV, then FLASK_ENV (e.g. 'development', 'production').
    S3_KEY_PREFIX: str | None = os.getenv("S3_KEY_PREFIX")
    # Signed URL expirations (seconds)
    S3_PRESIGN_PUT_EXPIRES_SECONDS: int = int(
        os.getenv("S3_PRESIGN_PUT_EXPIRES_SECONDS", "900")
    )
    S3_PRESIGN_GET_EXPIRES_SECONDS: int = int(
        os.getenv("S3_PRESIGN_GET_EXPIRES_SECONDS", "900")
    )

    # Email notifications via AWS SES
    SES_REGION: str | None = os.getenv("SES_REGION", "us-east-2")
    SES_SENDER_EMAIL: str | None = os.getenv("SES_SENDER_EMAIL")
    # SNS topic that receives SES bounce/complaint notifications. Required
    # before the webhook will accept anything.
    SES_SNS_TOPIC_ARN: str | None = os.getenv("SES_SNS_TOPIC_ARN")
    SES_SNS_AUTO_CONFIRM: bool = (
        os.getenv("SES_SNS_AUTO_CONFIRM", "false").lower() in {"1", "true", "yes", "on"}
    )
    SES_SNS_MAX_MESSAGE_AGE_SECONDS: int = int(
        os.getenv("SES_SNS_MAX_MESSAGE_AGE_SECONDS", "3600")
    )
    ADMIN_EMAIL: str | None = os.getenv("ADMIN_EMAIL")
    # instant | digest | off — controls per-signup notifications. Digest
    # sends one daily summary instead of one email per new user.
    NEW_USER_NOTIFICATION_MODE: str = os.getenv("NEW_USER_NOTIFICATION_MODE", "instant")
    # SES credentials — fall back to existing AWS creds (shared with S3)
    SES_ACCESS_KEY_ID: str | None = os.getenv("SES_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID")
    SES_SECRET_ACCESS_KEY: str | None = os.getenv("SES_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY")

    # Cost alerting
    MONTHLY_COST_ALERT_THRESHOLD_USD: float = float(
        os.getenv("MONTHLY_COST_ALERT_THRESHOLD_USD", "5.0")
    )

    @classmethod
    def admin_emails(cls) -> list[str]:
        """Admin recipients: ADMIN_EMAILS (comma-separated) or ADMIN_EMAIL."""
        raw = os.getenv("ADMIN_EMAILS") or cls.ADMIN_EMAIL or ""
        return [address.strip() for address in raw.split(",") if address.strip()]

    @classmethod
    def email_enabled(cls) -> bool:
        """
        Check if email notifications are properly configured.

        Returns True when SES credentials and at least one admin recipient
        are set.
        """
        return bool(
            cls.admin_emails()
            and cls.SES_ACCESS_KEY_ID
            and cls.SES_SECRET_ACCESS_KEY
        )

    @classmethod
    def audio_clips_enabled(cls) -> bool:
        """
        Feature flag for audio clip storage/upload/playback.

        Default: disabled (opt-in).
        """
        raw = (os.getenv("AUDIO_CLIPS_ENABLED", "false") or "").strip().lower()
        return raw in {"1", "true", "yes", "on"}

    @classmethod
    def validate_audio_clips(cls) -> None:
        """
        Validate configuration required when audio clips are enabled.

        We intentionally keep the requirements minimal to support multiple providers:
        - Bucket is always required.
        - Region/credentials may be optional for some S3-compatible setups or IAM roles.
        """
        if not cls.audio_clips_enabled():
            return
        if not (os.getenv("S3_BUCKET") or cls.S3_BUCKET):
            raise ValueError("AUDIO_CLIPS_ENABLED is true but S3_BUCKET is not set")

    @classmethod
    def effective_s3_key_prefix(cls) -> str:
        """
        Resolve the effective object key prefix for S3, normalized to a small set of values.

        Priority:
          1) S3_KEY_PREFIX (explicit override)
          2) APP_ENV / ENV (generic)
          3) FLASK_ENV (fallback)
        """

        raw = (cls.S3_KEY_PREFIX or cls.APP_ENV or cls.FLASK_ENV or "").strip()
        if not raw:
            return ""

        # Normalize: lowercase, remove slashes, trim whitespace/underscores.
        v = raw.strip().lower().strip().strip("/").replace(" ", "-").replace("_", "-")
        v = v.strip("-")

        # Canonicalize common variants to stable prefixes.
        aliases = {
            "prod": "prod",
            "production": "prod",
            "live": "prod",
            "release": "prod",
            "dev": "dev",
            "development": "dev",
            "local": "dev",
            "staging": "staging",
            "stage": "staging",
            "test": "test",
            "testing": "test",
            "ci": "test",
        }
        return aliases.get(v, v)

    @classmethod
    def validate(cls):
        """Validate required configuration"""
        errors = []

        if not cls.OPENAI_API_KEY:
            errors.append("OPENAI_API_KEY is not set")

        if errors:
            raise ValueError(f"Configuration errors: {', '.join(errors)}")


# Create config instance
config = Config()
