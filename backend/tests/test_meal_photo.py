"""
Tests for photo-based meal capture: POST /api/meals/extract-photo.

The vision extractor is replaced with a fake in every test; nothing here
touches the network or the real OpenAI client.
"""
from __future__ import annotations

import io
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import create_app
from app.config import Config
from app.services import meal_vision
from app.services.container import Services
from app.services.meal_extractor import MealType
from app.services.meal_vision import (
    ExtractedMealPhotoItem,
    MealPhotoExtractionResult,
    MealVisionService,
)
from app.services.storage import NoteStorage

JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 64


# ============================================================================
# TEST FAKES
# ============================================================================


class _FakeEmbeddings:
    model = "test-embedding-model"

    def embed_text(self, text):
        return [0.0] * 1536

    def embed_query(self, text):
        return [0.0] * 1536

    def upsert_for_note(self, storage, user_id, note_id, title, content, tags=None, summary=None):
        return True


class _FakeMealExtractor:
    def extract(self, transcription, current_date=None):
        raise AssertionError("meal extractor should not be called in photo tests")


class _FakeVinylExtractor:
    model = "gpt-4.1-mini"

    def extract(self, image_urls):
        raise AssertionError("vinyl extractor should not be called in photo tests")


class _FakeUsageTracking:
    def __init__(self):
        self.calls: list[dict] = []

    def record_usage(self, **kwargs):
        self.calls.append(kwargs)
        return "test-usage-id"

    def check_quota(self, user_id, service_type):
        return SimpleNamespace(allowed=True, warning=False)

    def get_current_usage(self, user_id):
        return None

    def get_usage_history(self, *args, **kwargs):
        return []

    def get_monthly_aggregate_cost(self):
        return 0.0


class _FakeEmailService:
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


def _result(
    *,
    meal_date: str | None = None,
    meal_time: str | None = "12:30",
) -> MealPhotoExtractionResult:
    return MealPhotoExtractionResult(
        meal_type=MealType.LUNCH,
        meal_date=meal_date,
        meal_time=meal_time,
        items=[
            ExtractedMealPhotoItem(name="grilled chicken", portion="1 breast"),
            ExtractedMealPhotoItem(name="rice", portion="1 cup"),
        ],
        confidence=0.88,
        reasoning="Clear plate with chicken and rice.",
    )


class _FakeMealVision:
    model = "fake-vision-model"

    def __init__(self):
        self.calls: list[tuple[str, str | None]] = []
        self.result = _result()

    def extract(self, image_data_url, current_date=None):
        self.calls.append((image_data_url, current_date))
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


class _BrokenMealVision:
    model = "fake-vision-model"

    def extract(self, image_data_url, current_date=None):
        raise ValueError("provider returned malformed JSON")


# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture()
def vision():
    return _FakeMealVision()


@pytest.fixture()
def usage():
    return _FakeUsageTracking()


@pytest.fixture()
def app(tmp_path: Path, monkeypatch, vision, usage):
    monkeypatch.setenv("AUDIO_CLIPS_ENABLED", "true")
    monkeypatch.setattr(meal_vision, "get_meal_vision_service", lambda: vision)

    services = Services(
        storage=NoteStorage(db_path=tmp_path / "meal_photo_test.db"),
        embeddings=_FakeEmbeddings(),
        planner=SimpleNamespace(plan=lambda *a, **k: None),
        asker=SimpleNamespace(answer=lambda *a, **k: None),
        categorizer=SimpleNamespace(categorize=lambda *a, **k: None),
        summarizer=SimpleNamespace(summarize=lambda *a, **k: None),
        meal_extractor=_FakeMealExtractor(),
        vinyl_extractor=_FakeVinylExtractor(),
        usage_tracking=usage,
        email=_FakeEmailService(),
    )

    app = create_app(testing=True, services=services)
    yield app


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def auth_headers():
    return {"X-Test-User-Id": "photo-user-123"}


def _post_photo(client, headers, data=JPEG_BYTES, mime="image/jpeg", filename="meal.jpg"):
    return client.post(
        "/api/meals/extract-photo",
        headers=headers,
        data={"file": (io.BytesIO(data), filename, mime)},
        content_type="multipart/form-data",
    )


# ============================================================================
# SUCCESS
# ============================================================================


class TestExtractMealPhoto:
    def test_returns_preview_and_does_not_save_meal(self, client, auth_headers, vision):
        response = _post_photo(client, auth_headers)
        assert response.status_code == 200, response.get_json()

        data = response.get_json()
        assert data["meal_type"] == "lunch"
        assert data["meal_date"] == date.today().isoformat()
        assert data["meal_time"] == "12:30"
        assert data["confidence"] == 0.88
        assert data["reasoning"] == "Clear plate with chicken and rice."
        assert data["items"] == [
            {"name": "grilled chicken", "portion": "1 breast"},
            {"name": "rice", "portion": "1 cup"},
        ]

        # The image reached the extractor as an inline data URL with today's date.
        assert len(vision.calls) == 1
        image_url, current_date = vision.calls[0]
        assert image_url.startswith("data:image/jpeg;base64,")
        assert current_date == date.today().isoformat()

        # Preview only: the meal list stays empty.
        today = date.today().isoformat()
        listing = client.get(
            f"/api/meals?start_date={today}&end_date={today}",
            headers=auth_headers,
        )
        assert listing.status_code == 200
        assert listing.get_json()["meals"] == []

    def test_receipt_date_and_blank_values_are_normalized(
        self, client, auth_headers, vision
    ):
        vision.result = _result(meal_date="2026-02-03", meal_time="7:05 PM")
        response = _post_photo(client, auth_headers)
        assert response.status_code == 200, response.get_json()

        data = response.get_json()
        assert data["meal_date"] == "2026-02-03"
        # An unparseable time is dropped rather than failing the whole scan.
        assert data["meal_time"] is None

    def test_invalid_meal_date_falls_back_to_today(self, client, auth_headers, vision):
        vision.result = _result(meal_date="not-a-date")
        response = _post_photo(client, auth_headers)
        assert response.status_code == 200, response.get_json()
        assert response.get_json()["meal_date"] == date.today().isoformat()

    def test_records_usage_with_the_vision_model(self, client, auth_headers, usage):
        response = _post_photo(client, auth_headers)
        assert response.status_code == 200
        assert usage.calls
        assert usage.calls[0]["service_type"] == "meal_photo_extraction"
        assert usage.calls[0]["model"] == "fake-vision-model"
        assert usage.calls[0]["endpoint"] == "/api/meals/extract-photo"

    def test_accepts_png_and_webp(self, client, auth_headers):
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
        assert _post_photo(client, auth_headers, data=png, mime="image/png").status_code == 200

        webp = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 32
        assert (
            _post_photo(client, auth_headers, data=webp, mime="image/webp").status_code == 200
        )


# ============================================================================
# VALIDATION
# ============================================================================


class TestExtractMealPhotoValidation:
    def test_requires_a_file(self, client, auth_headers):
        response = client.post(
            "/api/meals/extract-photo",
            headers=auth_headers,
            content_type="multipart/form-data",
        )
        assert response.status_code == 400
        assert "file" in response.get_json()["error"]

    def test_rejects_non_image_declared_type(self, client, auth_headers):
        response = _post_photo(
            client, auth_headers, data=b"not an image", mime="text/plain", filename="meal.txt"
        )
        assert response.status_code == 400
        assert "Unsupported image type" in response.get_json()["error"]

    def test_rejects_content_that_does_not_match_declared_type(self, client, auth_headers):
        response = _post_photo(
            client, auth_headers, data=b"not an image", mime="image/jpeg", filename="meal.jpg"
        )
        assert response.status_code == 400
        assert "does not match" in response.get_json()["error"]

    def test_rejects_empty_file(self, client, auth_headers):
        response = _post_photo(client, auth_headers, data=b"")
        assert response.status_code == 400
        assert response.get_json()["error"] == "Empty file"

    def test_rejects_oversize_image(self, client, auth_headers, monkeypatch):
        monkeypatch.setattr(Config, "MAX_IMAGE_BYTES", 8)
        response = _post_photo(client, auth_headers, data=JPEG_BYTES)
        assert response.status_code == 413
        assert "too large" in response.get_json()["error"]

    def test_requires_auth(self, client):
        response = _post_photo(client, {})
        assert response.status_code == 401


# ============================================================================
# PROVIDER FAILURES
# ============================================================================


class TestExtractMealPhotoProviderFailure:
    def test_malformed_provider_output_returns_503(self, client, auth_headers, monkeypatch):
        monkeypatch.setattr(
            meal_vision, "get_meal_vision_service", lambda: _BrokenMealVision()
        )

        response = _post_photo(client, auth_headers)
        assert response.status_code == 503
        body = response.get_json()
        assert "error" in body
        # Provider details must not leak to the client.
        assert "malformed" not in body["error"]
        assert "ValueError" not in body["error"]

        today = date.today().isoformat()
        listing = client.get(
            f"/api/meals?start_date={today}&end_date={today}",
            headers=auth_headers,
        )
        assert listing.get_json()["meals"] == []

    def test_missing_vision_client_returns_503(self, client, auth_headers, monkeypatch):
        def _raise():
            raise ValueError("OPENAI_API_KEY is required for OpenAI-backed features")

        monkeypatch.setattr(meal_vision, "get_meal_vision_service", _raise)
        response = _post_photo(client, auth_headers)
        assert response.status_code == 503


# ============================================================================
# SERVICE UNIT TESTS (no network)
# ============================================================================


class _FakeParseEndpoint:
    def __init__(self, parsed):
        self.parsed = parsed
        self.kwargs: dict | None = None

    def parse(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(parsed=self.parsed))]
        )


class _FakeOpenAIClient:
    def __init__(self, parsed):
        self.endpoint = _FakeParseEndpoint(parsed)
        self.beta = SimpleNamespace(chat=SimpleNamespace(completions=self.endpoint))


class TestMealVisionService:
    def test_extract_sends_inline_image_and_parses_result(self):
        expected = _result(meal_date="2026-02-03")
        client = _FakeOpenAIClient(expected)
        service = MealVisionService(client=client, model="test-vision-model")

        result = service.extract("data:image/jpeg;base64,abc", "2026-02-03")

        assert result is expected
        kwargs = client.endpoint.kwargs
        assert kwargs["model"] == "test-vision-model"
        user_content = kwargs["messages"][1]["content"]
        assert user_content[0]["type"] == "text"
        assert "2026-02-03" in user_content[0]["text"]
        assert user_content[1] == {
            "type": "image_url",
            "image_url": {"url": "data:image/jpeg;base64,abc"},
        }

    def test_extract_rejects_empty_image(self):
        service = MealVisionService(client=_FakeOpenAIClient(None), model="test")
        with pytest.raises(ValueError):
            service.extract("", "2026-02-03")

    def test_extract_rejects_empty_provider_response(self):
        service = MealVisionService(client=_FakeOpenAIClient(None), model="test")
        with pytest.raises(ValueError, match="empty response"):
            service.extract("data:image/jpeg;base64,abc", "2026-02-03")
