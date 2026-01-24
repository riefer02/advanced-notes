"""
Tests for meal tracking API endpoints.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from app import create_app
from app.services.container import Services
from app.services.meal_extractor import MealExtractionResult, MealType, ExtractedFoodItem
from app.services.models import MealEntryMetadata
from app.services.storage import NoteStorage


# ============================================================================
# TEST FAKES
# ============================================================================


class _FakeAsker:
    def answer(self, question, plan, notes):
        class _Result:
            answer_markdown = "test answer"
            cited_note_ids = []
            followups = []

        return _Result()


class _FakeCategorizer:
    def categorize(self, transcription, existing_folders):
        raise AssertionError("categorizer should not be called in meal tests")


class _FakeSummarizer:
    def summarize(self, notes_content):
        class _DigestResult:
            summary = "Test summary"
            key_themes = []
            action_items = []

            def model_dump_json(self):
                import json
                return json.dumps(self.model_dump())

            def model_dump(self):
                return {
                    "summary": self.summary,
                    "key_themes": self.key_themes,
                    "action_items": self.action_items,
                }

        return _DigestResult()


class _FakeEmbeddings:
    model = "test-embedding-model"

    def embed_text(self, text):
        return [0.0] * 1536

    def embed_query(self, text):
        return [0.0] * 1536

    def upsert_for_note(self, storage, user_id, note_id, title, content, tags=None):
        return True


class _FakePlanner:
    def plan(self, question, known_tags, known_folders, result_limit):
        class _TimeRange:
            start_date = None
            end_date = None

        class _Plan:
            def __init__(self):
                self.semantic_query = question
                self.keywords = []
                self.folder_paths = None
                self.include_tags = []
                self.exclude_tags = []
                self.time_range = _TimeRange()
                self._result_limit = result_limit

            @property
            def result_limit(self):
                return self._result_limit

            def model_dump(self):
                return {}

            def model_dump_json(self):
                return "{}"

        return _Plan()


class _FakeMealExtractor:
    """Fake meal extractor that returns predictable results."""

    def extract(self, transcription: str, current_date: str | None = None):
        # Return a predictable extraction result
        return MealExtractionResult(
            meal_type=MealType.BREAKFAST,
            meal_date=current_date or date.today().isoformat(),
            meal_time="08:00",
            food_items=[
                ExtractedFoodItem(name="eggs", portion="2", confidence=0.95),
                ExtractedFoodItem(name="toast", portion="1 slice", confidence=0.9),
            ],
            confidence=0.92,
            reasoning="Test extraction",
        )


class _FakeUsageTracking:
    """Fake usage tracking service for tests."""

    def record_usage(self, **kwargs):
        return "test-usage-id"

    def check_quota(self, user_id, service_type):
        class _QuotaCheck:
            allowed = True
            warning = False
        return _QuotaCheck()

    def get_current_usage(self, user_id):
        pass

    def get_usage_history(self, *a, **k):
        return []


# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture()
def app(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("AUDIO_CLIPS_ENABLED", "true")
    test_db = tmp_path / "meal_test.db"
    storage = NoteStorage(db_path=test_db)
    services = Services(
        storage=storage,
        embeddings=_FakeEmbeddings(),
        planner=_FakePlanner(),
        asker=_FakeAsker(),
        categorizer=_FakeCategorizer(),
        summarizer=_FakeSummarizer(),
        meal_extractor=_FakeMealExtractor(),
        usage_tracking=_FakeUsageTracking(),
    )

    app = create_app(testing=True, services=services)
    yield app


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def storage(app):
    return app.extensions["services"].storage


@pytest.fixture()
def user_id():
    return "test-user-123"


@pytest.fixture()
def auth_headers(user_id):
    return {"X-Test-User-Id": user_id}


@pytest.fixture()
def sample_meal(storage, user_id):
    """Create a sample meal for testing."""
    metadata = MealEntryMetadata(
        meal_type="lunch",
        meal_date=date.today().isoformat(),
        meal_time="12:30",
        confidence=0.85,
        transcription_duration=5.0,
        model_version="whisper-1",
    )
    food_items = [
        {"name": "sandwich", "portion": "1", "confidence": 0.9},
        {"name": "chips", "portion": "small bag", "confidence": 0.85},
        {"name": "apple", "portion": None, "confidence": 0.95},
    ]
    meal_id = storage.save_meal_entry(
        user_id=user_id,
        transcription="I had a sandwich with chips and an apple for lunch",
        metadata=metadata,
        food_items=food_items,
    )
    return meal_id


# ============================================================================
# MEAL CRUD TESTS
# ============================================================================


class TestMealCRUD:
    """Tests for meal CRUD operations."""

    def test_get_meal_not_found(self, client, auth_headers):
        """GET /api/meals/<id> returns 404 for non-existent meal."""
        response = client.get("/api/meals/nonexistent-id", headers=auth_headers)
        assert response.status_code == 404

    def test_get_meal_success(self, client, auth_headers, sample_meal):
        """GET /api/meals/<id> returns meal with items."""
        response = client.get(f"/api/meals/{sample_meal}", headers=auth_headers)
        assert response.status_code == 200

        data = response.get_json()
        assert data["id"] == sample_meal
        assert data["meal_type"] == "lunch"
        assert len(data["items"]) == 3
        assert data["items"][0]["name"] == "sandwich"

    def test_update_meal_type(self, client, auth_headers, sample_meal):
        """PUT /api/meals/<id> can update meal type."""
        response = client.put(
            f"/api/meals/{sample_meal}",
            headers=auth_headers,
            json={"meal_type": "dinner"},
        )
        assert response.status_code == 200

        data = response.get_json()
        assert data["meal_type"] == "dinner"

    def test_update_meal_date(self, client, auth_headers, sample_meal):
        """PUT /api/meals/<id> can update meal date."""
        new_date = "2026-01-15"
        response = client.put(
            f"/api/meals/{sample_meal}",
            headers=auth_headers,
            json={"meal_date": new_date},
        )
        assert response.status_code == 200

        data = response.get_json()
        assert data["meal_date"] == new_date

    def test_update_meal_transcription(self, client, auth_headers, sample_meal):
        """PUT /api/meals/<id> can update transcription."""
        new_transcription = "Updated: had a big lunch"
        response = client.put(
            f"/api/meals/{sample_meal}",
            headers=auth_headers,
            json={"transcription": new_transcription},
        )
        assert response.status_code == 200

        data = response.get_json()
        assert data["transcription"] == new_transcription

    def test_delete_meal_success(self, client, auth_headers, sample_meal):
        """DELETE /api/meals/<id> removes meal."""
        response = client.delete(f"/api/meals/{sample_meal}", headers=auth_headers)
        assert response.status_code == 200

        # Verify it's gone
        response = client.get(f"/api/meals/{sample_meal}", headers=auth_headers)
        assert response.status_code == 404

    def test_delete_meal_not_found(self, client, auth_headers):
        """DELETE /api/meals/<id> returns 404 for non-existent meal."""
        response = client.delete("/api/meals/nonexistent-id", headers=auth_headers)
        assert response.status_code == 404


# ============================================================================
# MEAL LISTING TESTS
# ============================================================================


class TestMealListing:
    """Tests for meal listing endpoints."""

    def test_list_meals_requires_dates(self, client, auth_headers):
        """GET /api/meals requires start_date and end_date."""
        response = client.get("/api/meals", headers=auth_headers)
        assert response.status_code == 400

        response = client.get("/api/meals?start_date=2026-01-01", headers=auth_headers)
        assert response.status_code == 400

    def test_list_meals_by_date_range(self, client, auth_headers, sample_meal):
        """GET /api/meals returns meals within date range."""
        today = date.today().isoformat()
        response = client.get(
            f"/api/meals?start_date={today}&end_date={today}",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.get_json()
        assert "meals" in data
        assert len(data["meals"]) == 1
        assert data["meals"][0]["id"] == sample_meal

    def test_list_meals_empty_range(self, client, auth_headers, sample_meal):
        """GET /api/meals returns empty for date range with no meals."""
        response = client.get(
            "/api/meals?start_date=2020-01-01&end_date=2020-01-31",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.get_json()
        assert data["meals"] == []

    def test_list_meals_filter_by_type(self, client, auth_headers, sample_meal, storage, user_id):
        """GET /api/meals can filter by meal_type."""
        # Create a breakfast meal
        metadata = MealEntryMetadata(
            meal_type="breakfast",
            meal_date=date.today().isoformat(),
        )
        storage.save_meal_entry(
            user_id=user_id,
            transcription="eggs and toast",
            metadata=metadata,
            food_items=[{"name": "eggs", "portion": "2", "confidence": 0.9}],
        )

        today = date.today().isoformat()

        # Filter for lunch only
        response = client.get(
            f"/api/meals?start_date={today}&end_date={today}&meal_type=lunch",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["meals"]) == 1
        assert data["meals"][0]["meal_type"] == "lunch"

        # Filter for breakfast only
        response = client.get(
            f"/api/meals?start_date={today}&end_date={today}&meal_type=breakfast",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["meals"]) == 1
        assert data["meals"][0]["meal_type"] == "breakfast"


# ============================================================================
# CALENDAR TESTS
# ============================================================================


class TestMealCalendar:
    """Tests for calendar endpoint."""

    def test_calendar_requires_params(self, client, auth_headers):
        """GET /api/meals/calendar requires year and month."""
        response = client.get("/api/meals/calendar", headers=auth_headers)
        assert response.status_code == 400

        response = client.get("/api/meals/calendar?year=2026", headers=auth_headers)
        assert response.status_code == 400

    def test_calendar_invalid_month(self, client, auth_headers):
        """GET /api/meals/calendar validates month range."""
        response = client.get("/api/meals/calendar?year=2026&month=13", headers=auth_headers)
        assert response.status_code == 400

        response = client.get("/api/meals/calendar?year=2026&month=0", headers=auth_headers)
        assert response.status_code == 400

    def test_calendar_returns_grouped_data(self, client, auth_headers, sample_meal):
        """GET /api/meals/calendar returns meals grouped by date."""
        today = date.today()
        response = client.get(
            f"/api/meals/calendar?year={today.year}&month={today.month}",
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.get_json()
        assert "calendar" in data
        assert data["year"] == today.year
        assert data["month"] == today.month

        # Check that today's date has our meal
        today_str = today.isoformat()
        assert today_str in data["calendar"]
        assert len(data["calendar"][today_str]) == 1
        assert data["calendar"][today_str][0]["meal_type"] == "lunch"
        assert data["calendar"][today_str][0]["item_count"] == 3


# ============================================================================
# MEAL ITEM TESTS
# ============================================================================


class TestMealItems:
    """Tests for meal item CRUD operations."""

    def test_add_item_success(self, client, auth_headers, sample_meal):
        """POST /api/meals/<id>/items adds a food item."""
        response = client.post(
            f"/api/meals/{sample_meal}/items",
            headers=auth_headers,
            json={"name": "cookie", "portion": "2"},
        )
        assert response.status_code == 201

        data = response.get_json()
        assert data["name"] == "cookie"
        assert data["portion"] == "2"
        assert data["meal_entry_id"] == sample_meal

        # Verify item appears in meal
        response = client.get(f"/api/meals/{sample_meal}", headers=auth_headers)
        data = response.get_json()
        assert len(data["items"]) == 4  # 3 original + 1 new

    def test_add_item_requires_name(self, client, auth_headers, sample_meal):
        """POST /api/meals/<id>/items requires name."""
        response = client.post(
            f"/api/meals/{sample_meal}/items",
            headers=auth_headers,
            json={"portion": "2"},
        )
        assert response.status_code == 400

        response = client.post(
            f"/api/meals/{sample_meal}/items",
            headers=auth_headers,
            json={"name": "  "},  # Whitespace only
        )
        assert response.status_code == 400

    def test_add_item_meal_not_found(self, client, auth_headers):
        """POST /api/meals/<id>/items returns 404 for non-existent meal."""
        response = client.post(
            "/api/meals/nonexistent/items",
            headers=auth_headers,
            json={"name": "test"},
        )
        assert response.status_code == 404

    def test_update_item_success(self, client, auth_headers, sample_meal, storage, user_id):
        """PUT /api/meals/<id>/items/<item_id> updates an item."""
        # Get an existing item
        meal = storage.get_meal_entry(user_id, sample_meal)
        item_id = meal.items[0].id

        response = client.put(
            f"/api/meals/{sample_meal}/items/{item_id}",
            headers=auth_headers,
            json={"name": "updated sandwich", "portion": "large"},
        )
        assert response.status_code == 200

        data = response.get_json()
        assert data["name"] == "updated sandwich"
        assert data["portion"] == "large"

    def test_update_item_not_found(self, client, auth_headers, sample_meal):
        """PUT /api/meals/<id>/items/<item_id> returns 404 for non-existent item."""
        response = client.put(
            f"/api/meals/{sample_meal}/items/nonexistent",
            headers=auth_headers,
            json={"name": "test"},
        )
        assert response.status_code == 404

    def test_delete_item_success(self, client, auth_headers, sample_meal, storage, user_id):
        """DELETE /api/meals/<id>/items/<item_id> removes an item."""
        # Get an existing item
        meal = storage.get_meal_entry(user_id, sample_meal)
        item_id = meal.items[0].id
        original_count = len(meal.items)

        response = client.delete(
            f"/api/meals/{sample_meal}/items/{item_id}",
            headers=auth_headers,
        )
        assert response.status_code == 200

        # Verify item is gone
        meal = storage.get_meal_entry(user_id, sample_meal)
        assert len(meal.items) == original_count - 1

    def test_delete_item_not_found(self, client, auth_headers, sample_meal):
        """DELETE /api/meals/<id>/items/<item_id> returns 404 for non-existent item."""
        response = client.delete(
            f"/api/meals/{sample_meal}/items/nonexistent",
            headers=auth_headers,
        )
        assert response.status_code == 404


# ============================================================================
# USER ISOLATION TESTS
# ============================================================================


class TestMealUserIsolation:
    """Tests to ensure meals are isolated between users."""

    def test_cannot_access_other_users_meal(self, client, sample_meal):
        """User cannot access another user's meal."""
        other_user_headers = {"X-Test-User-Id": "other-user-456"}

        response = client.get(f"/api/meals/{sample_meal}", headers=other_user_headers)
        assert response.status_code == 404

    def test_cannot_update_other_users_meal(self, client, sample_meal):
        """User cannot update another user's meal."""
        other_user_headers = {"X-Test-User-Id": "other-user-456"}

        response = client.put(
            f"/api/meals/{sample_meal}",
            headers=other_user_headers,
            json={"meal_type": "dinner"},
        )
        assert response.status_code == 404

    def test_cannot_delete_other_users_meal(self, client, sample_meal):
        """User cannot delete another user's meal."""
        other_user_headers = {"X-Test-User-Id": "other-user-456"}

        response = client.delete(f"/api/meals/{sample_meal}", headers=other_user_headers)
        assert response.status_code == 404

    def test_meal_list_only_shows_own_meals(self, client, sample_meal):
        """User only sees their own meals in listings."""
        other_user_headers = {"X-Test-User-Id": "other-user-456"}
        today = date.today().isoformat()

        response = client.get(
            f"/api/meals?start_date={today}&end_date={today}",
            headers=other_user_headers,
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["meals"]) == 0
