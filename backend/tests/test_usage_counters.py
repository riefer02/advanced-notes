"""Tests for monthly usage counters and quota enforcement."""

from __future__ import annotations

from sqlalchemy.orm import sessionmaker

from app.database import TokenUsage, UsageCounter
from app.services.storage import NoteStorage
from app.services.usage_tracking import UsageTrackingService


def _service(tmp_path) -> tuple[UsageTrackingService, NoteStorage]:
    storage = NoteStorage(db_path=tmp_path / "usage.db")
    factory = sessionmaker(
        bind=storage.engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        future=True,
    )
    return UsageTrackingService(session_factory=factory), storage


def test_record_usage_increments_counters(tmp_path):
    service, storage = _service(tmp_path)

    service.record_usage(
        user_id="user-a",
        service_type="transcription",
        model="gpt-transcribe",
        audio_seconds=120,
    )
    service.record_usage(
        user_id="user-a",
        service_type="chat",
        model="gpt-6-luna",
        prompt_tokens=100,
        completion_tokens=50,
    )

    usage = service.get_current_usage("user-a")
    assert usage.transcription_minutes_used == 2.0
    assert usage.ai_calls_used == 1
    assert usage.estimated_cost_usd >= 0

    with storage._session_scope() as session:
        counters = {row.service_type: row for row in session.query(UsageCounter).all()}
    assert counters["transcription"].units == 2.0
    assert counters["chat"].units == 1.0

    # A second transcription increments, it does not replace.
    service.record_usage(
        user_id="user-a",
        service_type="transcription",
        model="gpt-transcribe",
        audio_seconds=60,
    )
    assert service.get_current_usage("user-a").transcription_minutes_used == 3.0


def test_counters_are_user_scoped(tmp_path):
    service, _ = _service(tmp_path)
    service.record_usage(
        user_id="user-a",
        service_type="transcription",
        model="gpt-transcribe",
        audio_seconds=60,
    )

    assert service.get_current_usage("user-a").transcription_minutes_used == 1.0
    assert service.get_current_usage("user-b").transcription_minutes_used == 0.0


def test_quota_blocks_at_limit_and_warns_at_eighty_percent(tmp_path):
    service, _ = _service(tmp_path)
    quota = service.get_or_create_quota("user-a")
    quota.transcription_minutes_limit = 10
    with service._get_session() as session:
        session.merge(quota)

    service.record_usage(
        user_id="user-a",
        service_type="transcription",
        model="gpt-transcribe",
        audio_seconds=8 * 60,
    )
    warning = service.check_quota("user-a", "transcription")
    assert warning.allowed is True
    assert warning.warning is True

    service.record_usage(
        user_id="user-a",
        service_type="transcription",
        model="gpt-transcribe",
        audio_seconds=2 * 60,
    )
    blocked = service.check_quota("user-a", "transcription")
    assert blocked.allowed is False
    assert blocked.used == 10.0


def test_falls_back_to_token_usage_when_counters_are_absent(tmp_path):
    service, storage = _service(tmp_path)
    with storage._session_scope() as session:
        session.add(
            TokenUsage(
                id="legacy-1",
                user_id="legacy-user",
                service_type="transcription",
                model="gpt-transcribe",
                audio_duration_seconds=180,
                estimated_cost_usd=0.02,
            )
        )

    usage = service.get_current_usage("legacy-user")
    assert usage.transcription_minutes_used == 3.0
