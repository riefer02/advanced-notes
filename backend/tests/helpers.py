"""
Shared test helpers: fake service classes and app factory.

Import from test files to override individual fakes:
    from tests.helpers import make_app, FakeVinylExtractor
"""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from app import create_app
from app.services.container import Services
from app.services.storage import NoteStorage

# ============================================================================
# CANONICAL FAKE SERVICES
# ============================================================================


class FakeAsker:
    """Fake that returns canned answers.  Supports return_usage=True."""

    def answer(self, question, plan, notes, return_usage=False):  # noqa: ANN001
        class _Answer:
            answer_markdown = "test answer"
            cited_note_ids = []
            followups = ["What else?"]

        class _UsageInfo:
            prompt_tokens = 200
            completion_tokens = 100
            total_tokens = 300

        class _AskResult:
            answer = _Answer()
            usage = _UsageInfo()
            model = "test-model"

        if return_usage:
            return _AskResult()
        return _Answer()


class FakeCategorizer:
    def categorize(self, transcription, existing_folders):  # noqa: ANN001
        raise AssertionError("categorizer should not be called in these tests")


class FakeSummarizer:
    """Fake that returns canned summaries.  Supports return_usage=True."""

    def summarize(self, notes_content, return_usage=False):  # noqa: ANN001
        class _DigestResult:
            summary = "Test summary of notes"
            key_themes = ["theme1", "theme2"]
            action_items = ["action1", "action2"]

            def model_dump_json(self):
                import json

                return json.dumps(
                    {
                        "summary": self.summary,
                        "key_themes": self.key_themes,
                        "action_items": self.action_items,
                    }
                )

            def model_dump(self):
                return {
                    "summary": self.summary,
                    "key_themes": self.key_themes,
                    "action_items": self.action_items,
                }

        class _UsageInfo:
            prompt_tokens = 100
            completion_tokens = 50
            total_tokens = 150

        class _SummarizationResult:
            digest = _DigestResult()
            usage = _UsageInfo()
            model = "test-model"

        if return_usage:
            return _SummarizationResult()
        return _DigestResult()


class FakeEmbeddings:
    model = "test-embedding-model"

    def embed_text(self, text):
        return [0.0] * 1536

    def embed_query(self, text):
        return [0.0] * 1536

    def upsert_for_note(self, storage, user_id, note_id, title, content, tags=None):
        return True


class FakePlanner:
    """Fake planner that extracts simple keywords from the question."""

    def plan(self, question, known_tags, known_folders, result_limit):  # noqa: ANN001
        import re

        class _TimeRange:
            start_date = None
            end_date = None

        words = re.findall(r"\b[a-zA-Z]+\b", question)
        safe_keywords = [w.lower() for w in words if len(w) > 2][:5]

        class _Plan:
            def __init__(self, q, rl, kw):
                self.semantic_query = q
                self.keywords = kw
                self.folder_paths = None
                self.include_tags = []
                self.exclude_tags = []
                self.time_range = _TimeRange()
                self._result_limit = rl

            @property
            def result_limit(self):
                return self._result_limit

            def model_dump(self):
                return {
                    "semantic_query": self.semantic_query,
                    "keywords": self.keywords,
                    "folder_paths": self.folder_paths,
                    "include_tags": self.include_tags,
                    "exclude_tags": self.exclude_tags,
                    "time_range": {"start_date": None, "end_date": None},
                    "result_limit": self._result_limit,
                }

            def model_dump_json(self):
                import json

                return json.dumps(self.model_dump())

        return _Plan(question, result_limit, safe_keywords)


class FakeMealExtractor:
    def extract(self, transcription, current_date=None):  # noqa: ANN001
        raise AssertionError("meal extractor should not be called in these tests")


class FakeVinylExtractor:
    model = "gpt-4.1-mini"

    def extract(self, image_urls):
        raise AssertionError("vinyl extractor should not be called in these tests")


class FakeUsageTracking:
    """Fake usage tracking that always allows quota."""

    def record_usage(self, **kwargs):  # noqa: ANN001
        return "test-usage-id"

    def get_current_usage(self, user_id):  # noqa: ANN001
        class _UsageSummary:
            period_start = datetime.now(UTC)
            period_end = datetime.now(UTC)
            transcription_minutes_used = 0.0
            transcription_minutes_limit = 100
            ai_calls_used = 0
            ai_calls_limit = 500
            estimated_cost_usd = 0.0
            tier = "free"

            def model_dump(self):
                return {
                    "user_id": user_id,
                    "period_start": self.period_start.isoformat(),
                    "period_end": self.period_end.isoformat(),
                    "transcription_minutes_used": self.transcription_minutes_used,
                    "transcription_minutes_limit": self.transcription_minutes_limit,
                    "ai_calls_used": self.ai_calls_used,
                    "ai_calls_limit": self.ai_calls_limit,
                    "estimated_cost_usd": self.estimated_cost_usd,
                    "tier": self.tier,
                }

        return _UsageSummary()

    def check_quota(self, user_id, service_type):  # noqa: ANN001
        class _QuotaCheck:
            allowed = True
            used = 0.0
            limit = 100.0 if service_type == "transcription" else 500.0
            unit = "minutes" if service_type == "transcription" else "calls"
            resets_at = datetime.now(UTC)
            warning = False

        return _QuotaCheck()

    def get_usage_history(self, user_id, limit=50, offset=0, service_type=None):  # noqa: ANN001
        return []

    def get_monthly_aggregate_cost(self):
        return 0.0


class FakeEmailService:
    """Fake email service — unconfigured by default."""

    def is_configured(self):
        return False

    def send_feedback_notification(self, **kwargs):
        return False

    def send_new_user_notification(self, **kwargs):
        return False

    def send_cost_threshold_alert(self, **kwargs):
        return False

    def send_error_notification(self, **kwargs):
        return False


# ============================================================================
# APP FACTORY
# ============================================================================


def make_app(
    tmp_path: Path,
    *,
    db_name: str = "test.db",
    audio_clips: bool = True,
    s3_disabled: bool = False,
    monkeypatch=None,
    # Override individual fakes:
    asker=None,
    categorizer=None,
    summarizer=None,
    embeddings=None,
    planner=None,
    meal_extractor=None,
    vinyl_extractor=None,
    usage_tracking=None,
    email=None,
):
    """Create a test Flask app with fake services.

    Call from your own ``app`` fixture to override individual fakes:

        @pytest.fixture()
        def app(tmp_path, monkeypatch):
            return make_app(tmp_path, monkeypatch=monkeypatch,
                            meal_extractor=MySpecialFake())
    """
    if monkeypatch:
        if audio_clips:
            monkeypatch.setenv("AUDIO_CLIPS_ENABLED", "true")
        if s3_disabled:
            monkeypatch.delenv("S3_BUCKET", raising=False)
            monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
            monkeypatch.delenv("AWS_SECRET_ACCESS_KEY", raising=False)
            from app.config import Config

            monkeypatch.setattr(Config, "S3_BUCKET", None)

    test_db = tmp_path / db_name
    storage = NoteStorage(db_path=test_db)

    services = Services(
        storage=storage,
        embeddings=embeddings or FakeEmbeddings(),
        planner=planner or FakePlanner(),
        asker=asker or FakeAsker(),
        categorizer=categorizer or FakeCategorizer(),
        summarizer=summarizer or FakeSummarizer(),
        meal_extractor=meal_extractor or FakeMealExtractor(),
        vinyl_extractor=vinyl_extractor or FakeVinylExtractor(),
        usage_tracking=usage_tracking or FakeUsageTracking(),
        email=email or FakeEmailService(),
    )

    flask_app = create_app(testing=True, services=services)
    return flask_app


def auth(user_id: str = "test-user") -> dict[str, str]:
    """Return auth headers for the given user."""
    return {"X-Test-User-Id": user_id}
