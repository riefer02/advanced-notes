"""Tests for the public problem-report endpoint."""

from dataclasses import replace
from pathlib import Path

import pytest

from app.routes import reports
from tests.helpers import make_app


class _RecordingEmail:
    def __init__(self) -> None:
        self.reports: list[dict] = []

    def send_problem_report_notification(self, **kwargs):  # noqa: ANN003
        self.reports.append(kwargs)
        return True


@pytest.fixture()
def app(tmp_path: Path, monkeypatch):
    application = make_app(tmp_path, monkeypatch=monkeypatch, db_name="reports.db")
    reports._ip_limiter.limit = 2
    reports._user_limiter.limit = 2
    reports._ip_limiter.reset()
    reports._user_limiter.reset()
    return application


def test_report_is_queued_and_acknowledged(app):
    recorder = _RecordingEmail()
    app.extensions["services"] = replace(app.extensions["services"], email=recorder)

    response = app.test_client().post(
        "/api/report-problem",
        json={"message": "The dashboard is blank", "page": "/dashboard"},
    )

    assert response.status_code == 202
    payload = response.get_json()
    assert payload["status"] == "received"
    assert payload["report_id"]

    # The report is durable even if the notification path later fails.
    stored = app.extensions["services"].storage.list_problem_reports()
    assert len(stored) == 1
    assert stored[0]["id"] == payload["report_id"]
    assert stored[0]["message"] == "The dashboard is blank"
    assert stored[0]["page"] == "/dashboard"
    assert stored[0]["notified_at"] is not None

    assert len(recorder.reports) == 1
    assert recorder.reports[0]["report_id"] == payload["report_id"]
    assert recorder.reports[0]["page"] == "/dashboard"
    assert recorder.reports[0]["message"] == "The dashboard is blank"


def test_report_is_not_acknowledged_when_persistence_fails(app, monkeypatch):
    def _boom(**kwargs):  # noqa: ANN003
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(
        app.extensions["services"].storage, "create_problem_report", _boom
    )

    response = app.test_client().post(
        "/api/report-problem", json={"message": "broken"}
    )

    assert response.status_code == 503
    assert response.get_json()["error"]


def test_reports_are_rate_limited_per_ip(app):
    client = app.test_client()
    headers = {"X-Forwarded-For": "203.0.113.10"}

    first = client.post("/api/report-problem", json={}, headers=headers)
    second = client.post("/api/report-problem", json={}, headers=headers)
    third = client.post("/api/report-problem", json={}, headers=headers)

    assert first.status_code == 202
    assert second.status_code == 202
    assert third.status_code == 429
    assert third.headers["Retry-After"]


def test_reports_are_isolated_by_ip(app):
    client = app.test_client()

    assert client.post(
        "/api/report-problem", json={}, headers={"X-Forwarded-For": "198.51.100.1"}
    ).status_code == 202
    assert client.post(
        "/api/report-problem", json={}, headers={"X-Forwarded-For": "198.51.100.2"}
    ).status_code == 202


def test_unknown_api_route_returns_json(app):
    response = app.test_client().get("/api/does-not-exist")

    assert response.status_code == 404
    assert response.get_json() == {"error": "Not found"}
