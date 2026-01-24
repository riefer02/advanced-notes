"""
Usage tracking service for rate limiting and analytics.

Tracks all OpenAI API calls and enforces per-user quotas.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from pydantic import BaseModel, Field

from ..database import TokenUsage, UsageQuota, get_session

# Cost estimates per model (USD)
# These are approximate and should be updated as pricing changes
MODEL_COSTS = {
    # Chat/completion models (per 1K tokens)
    "gpt-4o-mini": {"prompt": 0.00015, "completion": 0.0006},
    "gpt-4o-mini-2024-07-18": {"prompt": 0.00015, "completion": 0.0006},
    # Transcription models (per minute)
    "gpt-4o-mini-transcribe": {"per_minute": 0.003},
    "gpt-4o-mini-transcribe-2025-12-15": {"per_minute": 0.003},
    "whisper-1": {"per_minute": 0.006},
    # Embedding models (per 1K tokens)
    "text-embedding-3-small": {"per_1k": 0.00002},
    "text-embedding-ada-002": {"per_1k": 0.0001},
}

# Default monthly limits for free tier
DEFAULT_TRANSCRIPTION_MINUTES = 100
DEFAULT_AI_CALLS = 500


class UsageSummary(BaseModel):
    """Current usage summary for a user."""

    user_id: str
    period_start: datetime
    period_end: datetime

    # Transcription usage
    transcription_minutes_used: float = 0.0
    transcription_minutes_limit: int = DEFAULT_TRANSCRIPTION_MINUTES

    # AI calls usage (chat, categorization, summarization)
    ai_calls_used: int = 0
    ai_calls_limit: int = DEFAULT_AI_CALLS

    # Cost tracking
    estimated_cost_usd: float = 0.0

    # Tier info
    tier: str = "free"


class QuotaCheckResult(BaseModel):
    """Result of checking a user's quota."""

    allowed: bool
    service_type: str
    used: float = Field(description="Amount used (minutes or count)")
    limit: float = Field(description="Quota limit")
    unit: str = Field(description="Unit of measurement (minutes or calls)")
    resets_at: datetime = Field(description="When the quota resets")
    warning: bool = Field(default=False, description="True if approaching limit (>80%)")


class UsageRecord(BaseModel):
    """Record of a single API usage event."""

    id: str
    user_id: str
    service_type: str
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    audio_duration_seconds: float | None = None
    endpoint: str | None = None
    estimated_cost_usd: float | None = None
    created_at: datetime


class UsageTrackingService:
    """
    Service for tracking API usage and enforcing quotas.

    Usage tracking is recorded for all OpenAI API calls:
    - transcription: Audio transcription (tracked by minutes)
    - categorization: Note categorization AI calls
    - chat: Ask/answer AI calls
    - summarization: Digest generation AI calls
    - embedding: Vector embedding generation (unlimited)
    """

    def __init__(self, session_factory=None):
        """
        Initialize the usage tracking service.

        Args:
            session_factory: Optional session factory for testing.
        """
        self._session_factory = session_factory

    def _get_session(self):
        """Get a database session."""
        if self._session_factory:
            return self._session_factory()
        return get_session()

    def _get_period_bounds(self) -> tuple[datetime, datetime]:
        """Get the start and end of the current billing period (monthly)."""
        now = datetime.now(UTC)
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # Calculate next month
        if now.month == 12:
            period_end = period_start.replace(year=now.year + 1, month=1)
        else:
            period_end = period_start.replace(month=now.month + 1)

        return period_start, period_end

    def _estimate_cost(
        self,
        model: str,
        prompt_tokens: int | None = None,
        completion_tokens: int | None = None,
        audio_seconds: float | None = None,
    ) -> float:
        """Estimate the cost of an API call."""
        cost = 0.0
        model_key = model.lower()

        # Find matching cost config
        cost_config = None
        for key, config in MODEL_COSTS.items():
            if key in model_key or model_key in key:
                cost_config = config
                break

        if not cost_config:
            return 0.0

        # Audio transcription cost
        if audio_seconds is not None and "per_minute" in cost_config:
            minutes = audio_seconds / 60.0
            cost += minutes * cost_config["per_minute"]

        # Token-based cost (chat/completion)
        if prompt_tokens is not None and "prompt" in cost_config:
            cost += (prompt_tokens / 1000.0) * cost_config["prompt"]
        if completion_tokens is not None and "completion" in cost_config:
            cost += (completion_tokens / 1000.0) * cost_config["completion"]

        # Embedding cost
        total_tokens = prompt_tokens or 0
        if "per_1k" in cost_config and total_tokens > 0:
            cost += (total_tokens / 1000.0) * cost_config["per_1k"]

        return round(cost, 8)

    def record_usage(
        self,
        user_id: str,
        service_type: str,
        model: str,
        prompt_tokens: int | None = None,
        completion_tokens: int | None = None,
        total_tokens: int | None = None,
        audio_seconds: float | None = None,
        endpoint: str | None = None,
    ) -> str:
        """
        Record a usage event.

        Args:
            user_id: The user ID
            service_type: Type of service (transcription, categorization, chat, summarization, embedding)
            model: The model used
            prompt_tokens: Number of prompt tokens (for chat APIs)
            completion_tokens: Number of completion tokens (for chat APIs)
            total_tokens: Total tokens (if not calculated from prompt + completion)
            audio_seconds: Duration of audio (for transcription)
            endpoint: The API endpoint that was called

        Returns:
            The ID of the created usage record
        """
        estimated_cost = self._estimate_cost(
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            audio_seconds=audio_seconds,
        )

        record_id = str(uuid4())

        with self._get_session() as session:
            record = TokenUsage(
                id=record_id,
                user_id=user_id,
                service_type=service_type,
                model=model,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens or ((prompt_tokens or 0) + (completion_tokens or 0)),
                audio_duration_seconds=audio_seconds,
                endpoint=endpoint,
                estimated_cost_usd=estimated_cost,
            )
            session.add(record)

        return record_id

    def get_or_create_quota(self, user_id: str) -> UsageQuota:
        """
        Get or create a user's quota record.

        Args:
            user_id: The user ID

        Returns:
            The user's quota record
        """
        with self._get_session() as session:
            quota = session.query(UsageQuota).filter(UsageQuota.user_id == user_id).first()

            if not quota:
                quota = UsageQuota(
                    id=str(uuid4()),
                    user_id=user_id,
                    tier="free",
                    transcription_minutes_limit=DEFAULT_TRANSCRIPTION_MINUTES,
                    ai_calls_limit=DEFAULT_AI_CALLS,
                )
                session.add(quota)
                session.flush()

            # Detach from session to return
            session.expunge(quota)
            return quota

    def get_current_usage(self, user_id: str) -> UsageSummary:
        """
        Get the current usage summary for a user.

        Args:
            user_id: The user ID

        Returns:
            UsageSummary with current period usage
        """
        period_start, period_end = self._get_period_bounds()
        quota = self.get_or_create_quota(user_id)

        with self._get_session() as session:
            # Get transcription usage (sum of audio_duration_seconds)
            from sqlalchemy import func as sqlfunc

            transcription_result = (
                session.query(sqlfunc.sum(TokenUsage.audio_duration_seconds))
                .filter(
                    TokenUsage.user_id == user_id,
                    TokenUsage.service_type == "transcription",
                    TokenUsage.created_at >= period_start,
                    TokenUsage.created_at < period_end,
                )
                .scalar()
            )
            transcription_seconds = transcription_result or 0.0
            transcription_minutes = transcription_seconds / 60.0

            # Get AI calls count (categorization, chat, summarization)
            ai_calls_result = (
                session.query(sqlfunc.count(TokenUsage.id))
                .filter(
                    TokenUsage.user_id == user_id,
                    TokenUsage.service_type.in_(["categorization", "chat", "summarization"]),
                    TokenUsage.created_at >= period_start,
                    TokenUsage.created_at < period_end,
                )
                .scalar()
            )
            ai_calls = ai_calls_result or 0

            # Get total estimated cost
            cost_result = (
                session.query(sqlfunc.sum(TokenUsage.estimated_cost_usd))
                .filter(
                    TokenUsage.user_id == user_id,
                    TokenUsage.created_at >= period_start,
                    TokenUsage.created_at < period_end,
                )
                .scalar()
            )
            estimated_cost = cost_result or 0.0

        return UsageSummary(
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
            transcription_minutes_used=round(transcription_minutes, 2),
            transcription_minutes_limit=quota.transcription_minutes_limit,
            ai_calls_used=ai_calls,
            ai_calls_limit=quota.ai_calls_limit,
            estimated_cost_usd=round(estimated_cost, 4),
            tier=quota.tier,
        )

    def check_quota(self, user_id: str, service_type: str) -> QuotaCheckResult:
        """
        Check if a user has quota remaining for a service type.

        Args:
            user_id: The user ID
            service_type: The service type (transcription or ai_calls)

        Returns:
            QuotaCheckResult indicating if the request is allowed
        """
        usage = self.get_current_usage(user_id)
        _, period_end = self._get_period_bounds()

        if service_type == "transcription":
            used = usage.transcription_minutes_used
            limit = float(usage.transcription_minutes_limit)
            unit = "minutes"
            allowed = used < limit
            warning = (used / limit) >= 0.8 if limit > 0 else False
        else:
            # AI calls (categorization, chat, summarization)
            used = float(usage.ai_calls_used)
            limit = float(usage.ai_calls_limit)
            unit = "calls"
            allowed = used < limit
            warning = (used / limit) >= 0.8 if limit > 0 else False

        return QuotaCheckResult(
            allowed=allowed,
            service_type=service_type,
            used=used,
            limit=limit,
            unit=unit,
            resets_at=period_end,
            warning=warning,
        )

    def get_usage_history(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
        service_type: str | None = None,
    ) -> list[UsageRecord]:
        """
        Get usage history for a user.

        Args:
            user_id: The user ID
            limit: Maximum records to return
            offset: Pagination offset
            service_type: Optional filter by service type

        Returns:
            List of usage records
        """
        with self._get_session() as session:
            query = session.query(TokenUsage).filter(TokenUsage.user_id == user_id)

            if service_type:
                query = query.filter(TokenUsage.service_type == service_type)

            query = query.order_by(TokenUsage.created_at.desc())
            query = query.limit(limit).offset(offset)

            records = query.all()

            return [
                UsageRecord(
                    id=r.id,
                    user_id=r.user_id,
                    service_type=r.service_type,
                    model=r.model,
                    prompt_tokens=r.prompt_tokens,
                    completion_tokens=r.completion_tokens,
                    total_tokens=r.total_tokens,
                    audio_duration_seconds=r.audio_duration_seconds,
                    endpoint=r.endpoint,
                    estimated_cost_usd=r.estimated_cost_usd,
                    created_at=r.created_at,
                )
                for r in records
            ]
