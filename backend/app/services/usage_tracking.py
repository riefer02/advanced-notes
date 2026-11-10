"""
Usage tracking service for rate limiting and analytics.

Tracks all OpenAI API calls and enforces per-user quotas.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import UTC, datetime
from uuid import uuid4

from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from ..database import TokenUsage, UsageCounter, UsageQuota, get_session

# Quota "AI calls" currently counts these service types (unchanged behavior).
AI_CALL_SERVICE_TYPES = ("categorization", "chat", "summarization")

# Cost estimates per model (USD)
# These are approximate and should be updated as pricing changes.
# Legacy entries stay so historical usage rows still price correctly.
MODEL_COSTS = {
    # Chat/completion models (per 1K tokens)
    "gpt-6-luna": {"prompt": 0.0001, "completion": 0.0005},
    "gpt-6.1-terra": {"prompt": 0.001, "completion": 0.005},
    "gpt-6-sol": {"prompt": 0.002, "completion": 0.01},
    "gpt-6.1-sol": {"prompt": 0.002, "completion": 0.01},
    "gpt-6-astra": {"prompt": 0.01, "completion": 0.05},
    "gpt-4o-mini": {"prompt": 0.00015, "completion": 0.0006},
    "gpt-4o-mini-2024-07-18": {"prompt": 0.00015, "completion": 0.0006},
    # Transcription models (per minute)
    "gpt-transcribe": {"per_minute": 0.0045},
    "gpt-4o-mini-transcribe": {"per_minute": 0.003},
    "gpt-4o-mini-transcribe-2025-12-15": {"per_minute": 0.003},
    "whisper-1": {"per_minute": 0.006},
    # Embedding models (per 1K tokens)
    "text-embedding-3-small": {"per_1k": 0.00002},
    "text-embedding-ada-002": {"per_1k": 0.0001},
}


def _lookup_model_cost(model: str) -> dict[str, float] | None:
    """Find pricing, preferring exact IDs and then the longest matching key.

    Exact-first stops `gpt-4o-mini` from swallowing
    `gpt-4o-mini-transcribe`; longest-first lets dated/fine-tuned IDs inherit
    their base model's price.
    """
    model_key = model.lower()
    if model_key in MODEL_COSTS:
        return MODEL_COSTS[model_key]
    for key in sorted(MODEL_COSTS, key=len, reverse=True):
        if key in model_key:
            return MODEL_COSTS[key]
    return None


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

    @contextmanager
    def _get_session(self):
        """Yield a session that commits on success for both factory modes."""
        if self._session_factory:
            session = self._session_factory()
            try:
                yield session
                session.commit()
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        else:
            with get_session() as session:
                yield session

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

        cost_config = _lookup_model_cost(model)
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
        period_start = self._get_period_bounds()[0].date()
        units = (
            (audio_seconds or 0.0) / 60.0
            if service_type == "transcription"
            else 1.0
        )

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
            self._increment_usage_counter(
                session,
                user_id=user_id,
                period_start=period_start,
                service_type=service_type,
                units=units,
                estimated_cost=estimated_cost,
            )

        return record_id

    def _increment_usage_counter(
        self,
        session,
        *,
        user_id: str,
        period_start,
        service_type: str,
        units: float,
        estimated_cost: float,
    ) -> None:
        """Upsert one monthly counter row in the same transaction as the log."""
        now = datetime.utcnow()
        values = {
            "user_id": user_id,
            "period_start": period_start,
            "service_type": service_type,
            "units": units,
            "estimated_cost_usd": estimated_cost,
            "updated_at": now,
        }
        dialect = session.bind.dialect.name if session.bind is not None else ""

        if dialect == "postgresql":
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            stmt = pg_insert(UsageCounter).values(**values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "period_start", "service_type"],
                set_={
                    "units": UsageCounter.units + units,
                    "estimated_cost_usd": (
                        UsageCounter.estimated_cost_usd + estimated_cost
                    ),
                    "updated_at": now,
                },
            )
            session.execute(stmt)
            return

        if dialect == "sqlite":
            from sqlalchemy.dialects.sqlite import insert as sqlite_insert

            stmt = sqlite_insert(UsageCounter).values(**values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "period_start", "service_type"],
                set_={
                    "units": UsageCounter.units + units,
                    "estimated_cost_usd": (
                        UsageCounter.estimated_cost_usd + estimated_cost
                    ),
                    "updated_at": now,
                },
            )
            session.execute(stmt)
            return

        existing = (
            session.query(UsageCounter)
            .filter(
                UsageCounter.user_id == user_id,
                UsageCounter.period_start == period_start,
                UsageCounter.service_type == service_type,
            )
            .one_or_none()
        )
        if existing:
            existing.units = (existing.units or 0.0) + units
            existing.estimated_cost_usd = (
                existing.estimated_cost_usd or 0.0
            ) + estimated_cost
            existing.updated_at = now
            session.add(existing)
        else:
            session.add(UsageCounter(**values))

    def get_or_create_quota(self, user_id: str) -> UsageQuota:
        """
        Get or create a user's quota record.

        Handles the concurrent first-request race: two requests can both see no
        row, and the loser must read the winner's row instead of raising.
        """

        def _load() -> UsageQuota | None:
            with self._get_session() as session:
                quota = (
                    session.query(UsageQuota)
                    .filter(UsageQuota.user_id == user_id)
                    .first()
                )
                if quota:
                    session.expunge(quota)
                return quota

        existing = _load()
        if existing:
            return existing

        try:
            with self._get_session() as session:
                quota = UsageQuota(
                    id=str(uuid4()),
                    user_id=user_id,
                    tier="free",
                    transcription_minutes_limit=DEFAULT_TRANSCRIPTION_MINUTES,
                    ai_calls_limit=DEFAULT_AI_CALLS,
                )
                session.add(quota)
                session.flush()
                session.expunge(quota)
                return quota
        except IntegrityError:
            created = _load()
            if created:
                return created
            raise

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
            counters = (
                session.query(UsageCounter)
                .filter(
                    UsageCounter.user_id == user_id,
                    UsageCounter.period_start == period_start.date(),
                )
                .all()
            )

            if counters:
                transcription_minutes = sum(
                    float(counter.units or 0.0)
                    for counter in counters
                    if counter.service_type == "transcription"
                )
                ai_calls = int(
                    sum(
                        float(counter.units or 0.0)
                        for counter in counters
                        if counter.service_type in AI_CALL_SERVICE_TYPES
                    )
                )
                estimated_cost = sum(
                    float(counter.estimated_cost_usd or 0.0)
                    for counter in counters
                )
            else:
                # Backward compatibility: counters are backfilled by migration,
                # but this keeps a partially migrated database correct.
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
                transcription_minutes = (transcription_result or 0.0) / 60.0

                ai_calls_result = (
                    session.query(sqlfunc.count(TokenUsage.id))
                    .filter(
                        TokenUsage.user_id == user_id,
                        TokenUsage.service_type.in_(list(AI_CALL_SERVICE_TYPES)),
                        TokenUsage.created_at >= period_start,
                        TokenUsage.created_at < period_end,
                    )
                    .scalar()
                )
                ai_calls = int(ai_calls_result or 0)

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

    def get_monthly_aggregate_cost(self) -> float:
        """
        Sum estimated_cost_usd across ALL users for the current billing period.

        Used for admin cost alerting (not per-user).
        """
        period_start, period_end = self._get_period_bounds()

        with self._get_session() as session:
            from sqlalchemy import func as sqlfunc

            result = (
                session.query(sqlfunc.sum(TokenUsage.estimated_cost_usd))
                .filter(
                    TokenUsage.created_at >= period_start,
                    TokenUsage.created_at < period_end,
                )
                .scalar()
            )
            return float(result or 0.0)

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
