"""Tests for self-hosted product analytics ingestion and admin aggregation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from tests.helpers import auth, make_app

ADMIN = "admin-user"


@pytest.fixture()
def app(tmp_path, monkeypatch):  # noqa: ANN001 - pytest fixture
    monkeypatch.setenv("ADMIN_USER_IDS", ADMIN)
    return make_app(tmp_path, monkeypatch=monkeypatch, db_name="analytics.db")


@pytest.fixture()
def client(app):  # noqa: ANN001 - pytest fixture
    return app.test_client()


def _post(client, body, user_id: str = "user-a"):  # noqa: ANN001, ANN201
    return client.post("/api/analytics/events", json=body, headers=auth(user_id))


def _summary(app, user_id: str):  # noqa: ANN001, ANN201
    since = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1)
    return app.extensions["services"].storage.get_analytics_summary(user_id, since)


def test_valid_batch_is_stored_for_the_authenticated_user(client, app):  # noqa: ANN001
    response = _post(
        client,
        {
            "events": [
                {"name": "dashboard_viewed"},
                {
                    "name": "search.opened",
                    "properties": {"surface": "command", "result_count": 3},
                },
            ]
        },
    )

    assert response.status_code == 202
    assert response.get_json() == {"accepted": 2}

    summary = _summary(app, "user-a")
    assert summary["total_events"] == 2
    assert {item["name"]: item["count"] for item in summary["by_name"]} == {
        "dashboard_viewed": 1,
        "search.opened": 1,
    }


def test_empty_batch_is_rejected(client):  # noqa: ANN001
    response = _post(client, {"events": []})

    assert response.status_code == 400
    assert "must not be empty" in response.get_json()["error"]


def test_oversize_batch_is_rejected(client):  # noqa: ANN001
    response = _post(
        client,
        {"events": [{"name": "dashboard_viewed"} for _ in range(51)]},
    )

    assert response.status_code == 400
    assert "at most 50" in response.get_json()["error"]


@pytest.mark.parametrize(
    "name",
    [
        "Dashboard Viewed",
        "UPPER_CASE",
        "1_starts_with_digit",
        "has-dash",
        "trailing.",
        "",
        "a" * 65,
    ],
)
def test_invalid_event_names_are_rejected(client, name):  # noqa: ANN001
    response = _post(client, {"events": [{"name": name}]})

    assert response.status_code == 400


def test_non_object_properties_are_rejected(client):  # noqa: ANN001
    response = _post(
        client,
        {"events": [{"name": "dashboard_viewed", "properties": ["not", "an", "object"]}]},
    )

    assert response.status_code == 400
    assert "must be an object" in response.get_json()["error"]


def test_oversized_properties_are_rejected(client):  # noqa: ANN001
    response = _post(
        client,
        {"events": [{"name": "dashboard_viewed", "properties": {"blob": "x" * 4096}}]},
    )

    assert response.status_code == 400
    assert "2048 bytes" in response.get_json()["error"]


def test_too_many_property_keys_are_rejected(client):  # noqa: ANN001
    properties = {f"k{index}": index for index in range(21)}
    response = _post(
        client,
        {"events": [{"name": "dashboard_viewed", "properties": properties}]},
    )

    assert response.status_code == 400


def test_analytics_ingestion_requires_auth(client):  # noqa: ANN001
    response = client.post(
        "/api/analytics/events",
        json={"events": [{"name": "dashboard_viewed"}]},
    )

    assert response.status_code == 401


def test_events_are_scoped_to_their_user(client, app):  # noqa: ANN001
    _post(client, {"events": [{"name": "dashboard_viewed"}]}, user_id="user-a")
    _post(
        client,
        {"events": [{"name": "dashboard_viewed"}, {"name": "ask_submitted"}]},
        user_id="user-b",
    )

    summary_a = _summary(app, "user-a")
    summary_b = _summary(app, "user-b")

    assert summary_a["total_events"] == 1
    assert [item["name"] for item in summary_a["by_name"]] == ["dashboard_viewed"]
    assert summary_b["total_events"] == 2
    assert {item["name"] for item in summary_b["by_name"]} == {
        "dashboard_viewed",
        "ask_submitted",
    }
    assert _summary(app, "user-c")["total_events"] == 0


def test_admin_summary_requires_admin(client, app):  # noqa: ANN001
    _post(client, {"events": [{"name": "dashboard_viewed"}]}, user_id="user-a")

    forbidden = client.get(
        "/api/admin/analytics/summary", headers=auth("not-an-admin")
    )
    unauthenticated = client.get("/api/admin/analytics/summary")

    assert forbidden.status_code == 403
    assert unauthenticated.status_code == 401


def test_admin_summary_aggregates_without_per_user_detail(client, app):  # noqa: ANN001
    _post(
        client,
        {"events": [{"name": "dashboard_viewed", "properties": {"secret": "do-not-leak"}}]},
        user_id="user-a",
    )
    _post(
        client,
        {"events": [{"name": "dashboard_viewed"}, {"name": "feedback_submitted"}]},
        user_id="user-b",
    )

    response = client.get(
        "/api/admin/analytics/summary?days=7", headers=auth(ADMIN)
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["days"] == 7
    assert payload["total_events"] == 3
    assert payload["unique_users"] == 2
    assert {item["name"]: item["count"] for item in payload["by_name"]} == {
        "dashboard_viewed": 2,
        "feedback_submitted": 1,
    }
    assert len(payload["daily"]) == 7
    assert sum(day["count"] for day in payload["daily"]) == 3
    # Aggregates only: no user ids and no property payloads.
    assert "do-not-leak" not in response.get_data(as_text=True)
    assert "user-a" not in response.get_data(as_text=True)
    assert "user-b" not in response.get_data(as_text=True)


@pytest.mark.parametrize("days", ["0", "366", "abc"])
def test_admin_summary_validates_days(client, days):  # noqa: ANN001
    response = client.get(
        f"/api/admin/analytics/summary?days={days}", headers=auth(ADMIN)
    )

    assert response.status_code == 400
