"""
Tests for vinyl collection API endpoints.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app import create_app
from app.services.container import Services
from app.services.storage import NoteStorage
from app.services.vinyl_extractor import ExtractedTrack, VinylExtractionResult

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
        raise AssertionError("categorizer should not be called in vinyl tests")


class _FakeSummarizer:
    def summarize(self, notes_content):
        raise AssertionError("summarizer should not be called in vinyl tests")


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
        raise AssertionError("planner should not be called in vinyl tests")


class _FakeMealExtractor:
    def extract(self, transcription, current_date=None):
        raise AssertionError("meal extractor should not be called in vinyl tests")


class _FakeVinylExtractor:
    """Fake vinyl extractor that returns predictable results."""
    model = "gpt-4.1-mini"

    def extract(self, image_urls: list[str]) -> VinylExtractionResult:
        return VinylExtractionResult(
            artist="Pink Floyd",
            album_title="The Dark Side of the Moon",
            release_year=1973,
            genre=["Progressive Rock", "Art Rock"],
            label="Harvest",
            catalog_number="SHVL 804",
            format="LP",
            pressing_country="UK",
            tracks=[
                ExtractedTrack(side="A", position=1, title="Speak to Me", duration="1:30"),
                ExtractedTrack(side="A", position=2, title="Breathe", duration="2:43"),
                ExtractedTrack(side="A", position=3, title="On the Run", duration="3:36"),
                ExtractedTrack(side="B", position=1, title="Money", duration="6:22"),
                ExtractedTrack(side="B", position=2, title="Us and Them", duration="7:49"),
            ],
            confidence=0.95,
            reasoning="Clear front cover and back cover tracklist visible",
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


class _FakeEmailService:
    """Fake email service for tests."""

    def is_configured(self):
        return False

    def send_feedback_notification(self, **kwargs):
        return False


# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture()
def app(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("S3_BUCKET", raising=False)
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("AWS_SECRET_ACCESS_KEY", raising=False)

    # Force Config to re-read env (class attrs read at import time)
    from app.config import Config
    monkeypatch.setattr(Config, "S3_BUCKET", None)

    test_db = tmp_path / "vinyl_test.db"
    storage = NoteStorage(db_path=test_db)
    services = Services(
        storage=storage,
        embeddings=_FakeEmbeddings(),
        planner=_FakePlanner(),
        asker=_FakeAsker(),
        categorizer=_FakeCategorizer(),
        summarizer=_FakeSummarizer(),
        meal_extractor=_FakeMealExtractor(),
        vinyl_extractor=_FakeVinylExtractor(),
        usage_tracking=_FakeUsageTracking(),
        email=_FakeEmailService(),
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
    return "test-vinyl-user-123"


@pytest.fixture()
def auth_headers(user_id):
    return {"X-Test-User-Id": user_id}


@pytest.fixture()
def sample_record(storage, user_id):
    """Create a sample vinyl record for testing."""
    record_id = storage.save_vinyl_record(
        user_id,
        artist="Led Zeppelin",
        album_title="Led Zeppelin IV",
        release_year=1971,
        genre=["Rock", "Hard Rock"],
        label="Atlantic",
        catalog_number="SD 19129",
        format="LP",
        pressing_country="US",
        condition="VG+",
        notes="Original pressing",
        tracks=[
            {"side": "A", "position": 1, "title": "Black Dog", "duration": "4:54"},
            {"side": "A", "position": 2, "title": "Rock and Roll", "duration": "3:40"},
            {"side": "B", "position": 1, "title": "Stairway to Heaven", "duration": "8:02"},
        ],
    )
    return record_id


# ============================================================================
# VINYL RECORD CRUD TESTS
# ============================================================================


class TestVinylCRUD:
    """Tests for vinyl record CRUD operations."""

    def test_create_vinyl_record(self, client, auth_headers):
        """POST /api/vinyl creates a new record."""
        response = client.post(
            "/api/vinyl",
            json={
                "artist": "The Beatles",
                "album_title": "Abbey Road",
                "release_year": 1969,
                "genre": ["Rock", "Pop"],
                "label": "Apple Records",
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.get_json()
        assert data["artist"] == "The Beatles"
        assert data["album_title"] == "Abbey Road"
        assert data["release_year"] == 1969
        assert "Rock" in data["genre"]

    def test_create_vinyl_record_missing_artist(self, client, auth_headers):
        """POST /api/vinyl returns 400 when artist is missing."""
        response = client.post(
            "/api/vinyl",
            json={"album_title": "Abbey Road"},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_create_vinyl_record_missing_album(self, client, auth_headers):
        """POST /api/vinyl returns 400 when album_title is missing."""
        response = client.post(
            "/api/vinyl",
            json={"artist": "The Beatles"},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_get_vinyl_record_not_found(self, client, auth_headers):
        """GET /api/vinyl/<id> returns 404 for non-existent record."""
        response = client.get("/api/vinyl/nonexistent-id", headers=auth_headers)
        assert response.status_code == 404

    def test_get_vinyl_record_success(self, client, auth_headers, sample_record):
        """GET /api/vinyl/<id> returns record with tracks."""
        response = client.get(f"/api/vinyl/{sample_record}", headers=auth_headers)
        assert response.status_code == 200

        data = response.get_json()
        assert data["id"] == sample_record
        assert data["artist"] == "Led Zeppelin"
        assert data["album_title"] == "Led Zeppelin IV"
        assert len(data["tracks"]) == 3
        assert data["tracks"][0]["title"] == "Black Dog"

    def test_list_vinyl_records_empty(self, client, auth_headers):
        """GET /api/vinyl returns empty list when no records."""
        response = client.get("/api/vinyl", headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["records"] == []
        assert data["total"] == 0

    def test_list_vinyl_records(self, client, auth_headers, sample_record):
        """GET /api/vinyl returns records."""
        response = client.get("/api/vinyl", headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["total"] >= 1
        assert any(r["id"] == sample_record for r in data["records"])

    def test_list_vinyl_records_filter_genre(self, client, auth_headers, sample_record):
        """GET /api/vinyl?genre=Rock filters by genre."""
        response = client.get("/api/vinyl?genre=Rock", headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["total"] >= 1

    def test_list_vinyl_records_filter_decade(self, client, auth_headers, sample_record):
        """GET /api/vinyl?decade=1970 filters by decade."""
        response = client.get("/api/vinyl?decade=1970", headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["total"] >= 1

    def test_list_vinyl_records_search(self, client, auth_headers, sample_record):
        """GET /api/vinyl?search=Zeppelin searches records."""
        response = client.get("/api/vinyl?search=Zeppelin", headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["total"] >= 1

    def test_list_vinyl_records_sort_by_artist(self, client, auth_headers, sample_record):
        """GET /api/vinyl?sort_by=artist sorts records."""
        response = client.get("/api/vinyl?sort_by=artist", headers=auth_headers)
        assert response.status_code == 200

    def test_update_vinyl_record(self, client, auth_headers, sample_record):
        """PUT /api/vinyl/<id> updates record fields."""
        response = client.put(
            f"/api/vinyl/{sample_record}",
            json={"condition": "NM", "notes": "Near mint condition"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["condition"] == "NM"
        assert data["notes"] == "Near mint condition"

    def test_update_vinyl_record_with_tracks(self, client, auth_headers, sample_record):
        """PUT /api/vinyl/<id> with tracks replaces tracklist."""
        new_tracks = [
            {"side": "A", "position": 1, "title": "Whole Lotta Love"},
        ]
        response = client.put(
            f"/api/vinyl/{sample_record}",
            json={"tracks": new_tracks},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.get_json()
        assert len(data["tracks"]) == 1
        assert data["tracks"][0]["title"] == "Whole Lotta Love"

    def test_update_vinyl_record_not_found(self, client, auth_headers):
        """PUT /api/vinyl/<id> returns 404 for non-existent record."""
        response = client.put(
            "/api/vinyl/nonexistent-id",
            json={"condition": "VG"},
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_delete_vinyl_record(self, client, auth_headers, sample_record):
        """DELETE /api/vinyl/<id> deletes a record."""
        response = client.delete(f"/api/vinyl/{sample_record}", headers=auth_headers)
        assert response.status_code == 200
        assert response.get_json()["success"] is True

        # Verify it's gone
        response = client.get(f"/api/vinyl/{sample_record}", headers=auth_headers)
        assert response.status_code == 404

    def test_delete_vinyl_record_not_found(self, client, auth_headers):
        """DELETE /api/vinyl/<id> returns 404 for non-existent record."""
        response = client.delete("/api/vinyl/nonexistent-id", headers=auth_headers)
        assert response.status_code == 404


# ============================================================================
# VINYL STATS TESTS
# ============================================================================


class TestVinylStats:
    """Tests for vinyl collection statistics."""

    def test_stats_empty(self, client, auth_headers):
        """GET /api/vinyl/stats returns zero counts when empty."""
        response = client.get("/api/vinyl/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["total_records"] == 0
        assert data["total_artists"] == 0

    def test_stats_with_records(self, client, auth_headers, sample_record):
        """GET /api/vinyl/stats returns correct counts."""
        response = client.get("/api/vinyl/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["total_records"] >= 1
        assert data["total_artists"] >= 1


# ============================================================================
# VINYL SEARCH TESTS
# ============================================================================


class TestVinylSearch:
    """Tests for vinyl search endpoint."""

    def test_search_requires_query(self, client, auth_headers):
        """GET /api/vinyl/search returns 400 without query."""
        response = client.get("/api/vinyl/search", headers=auth_headers)
        assert response.status_code == 400

    def test_search_vinyl(self, client, auth_headers, sample_record):
        """GET /api/vinyl/search?q=Zeppelin returns matching records."""
        response = client.get("/api/vinyl/search?q=Zeppelin", headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["query"] == "Zeppelin"
        assert data["total"] >= 1

    def test_search_no_results(self, client, auth_headers, sample_record):
        """GET /api/vinyl/search?q=nonexistent returns empty results."""
        response = client.get(
            "/api/vinyl/search?q=zzzznonexistentartist", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["total"] == 0


# ============================================================================
# VINYL IMAGE TESTS (without S3)
# ============================================================================


class TestVinylImages:
    """Tests for vinyl image endpoints (S3 not configured)."""

    def test_upload_image_no_s3(self, client, auth_headers, sample_record):
        """POST /api/vinyl/<id>/images returns 400 when S3 not configured."""
        from io import BytesIO

        data = {
            "file": (BytesIO(b"\xff\xd8\xff\xe0fake-jpg"), "photo.jpg", "image/jpeg"),
            "image_type": "front_cover",
        }
        response = client.post(
            f"/api/vinyl/{sample_record}/images",
            data=data,
            content_type="multipart/form-data",
            headers=auth_headers,
        )
        # S3 is not configured in test environment
        assert response.status_code == 400
        assert "S3" in response.get_json()["error"]


# ============================================================================
# VINYL EXTRACTION TESTS
# ============================================================================


class TestVinylExtraction:
    """Tests for vinyl OCR extraction endpoint."""

    def test_extract_no_images(self, client, auth_headers, sample_record):
        """POST /api/vinyl/<id>/extract returns 400 when no ready images."""
        response = client.post(
            f"/api/vinyl/{sample_record}/extract", headers=auth_headers
        )
        assert response.status_code == 400
        assert "No ready images" in response.get_json()["error"]

    def test_extract_not_found(self, client, auth_headers):
        """POST /api/vinyl/<id>/extract returns 404 for non-existent record."""
        response = client.post(
            "/api/vinyl/nonexistent-id/extract", headers=auth_headers
        )
        assert response.status_code == 404


# ============================================================================
# DIRECT PHOTO EXTRACTION TESTS
# ============================================================================


class TestVinylExtractPhotos:
    """Tests for the direct photo extraction endpoint (no S3)."""

    def test_extract_photos_success(self, client, auth_headers):
        """POST /api/vinyl/extract-photos returns extraction result."""
        import io
        # Create a minimal valid JPEG-like file
        fake_jpeg = io.BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 100)
        fake_jpeg.name = "test.jpg"

        response = client.post(
            "/api/vinyl/extract-photos",
            headers=auth_headers,
            data={"images": (fake_jpeg, "test.jpg", "image/jpeg")},
            content_type="multipart/form-data",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["artist"] == "Pink Floyd"
        assert data["album_title"] == "The Dark Side of the Moon"
        assert data["confidence"] == 0.95
        assert len(data["tracks"]) == 5

    def test_extract_photos_no_images(self, client, auth_headers):
        """POST /api/vinyl/extract-photos returns 400 when no images."""
        response = client.post(
            "/api/vinyl/extract-photos",
            headers=auth_headers,
            content_type="multipart/form-data",
        )
        assert response.status_code == 400

    def test_extract_photos_multiple(self, client, auth_headers):
        """POST /api/vinyl/extract-photos accepts multiple images."""
        import io
        data = {}
        files = []
        for i in range(3):
            f = io.BytesIO(b"\xff\xd8\xff\xe0" + b"\x00" * 50)
            files.append((f, f"img{i}.jpg", "image/jpeg"))
        data["images"] = files

        response = client.post(
            "/api/vinyl/extract-photos",
            headers=auth_headers,
            data=data,
            content_type="multipart/form-data",
        )
        assert response.status_code == 200
        assert response.get_json()["artist"] == "Pink Floyd"


# ============================================================================
# USER ISOLATION TESTS
# ============================================================================


class TestVinylUserIsolation:
    """Tests that vinyl records are isolated between users."""

    def test_cannot_see_other_users_records(self, client, sample_record):
        """Records created by one user are not visible to another."""
        other_headers = {"X-Test-User-Id": "other-user-456"}
        response = client.get(f"/api/vinyl/{sample_record}", headers=other_headers)
        assert response.status_code == 404

    def test_cannot_update_other_users_records(self, client, sample_record):
        """Cannot update another user's records."""
        other_headers = {"X-Test-User-Id": "other-user-456"}
        response = client.put(
            f"/api/vinyl/{sample_record}",
            json={"condition": "Poor"},
            headers=other_headers,
        )
        assert response.status_code == 404

    def test_cannot_delete_other_users_records(self, client, sample_record):
        """Cannot delete another user's records."""
        other_headers = {"X-Test-User-Id": "other-user-456"}
        response = client.delete(f"/api/vinyl/{sample_record}", headers=other_headers)
        assert response.status_code == 404

    def test_list_only_own_records(self, client, sample_record):
        """Listing records only returns the current user's records."""
        other_headers = {"X-Test-User-Id": "other-user-456"}
        response = client.get("/api/vinyl", headers=other_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert data["total"] == 0
