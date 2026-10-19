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
    assert len(recorder.reports) == 1
    assert recorder.reports[0]["page"] == "/dashboard"
    assert recorder.reports[0]["message"] == "The dashboard is blank"


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
