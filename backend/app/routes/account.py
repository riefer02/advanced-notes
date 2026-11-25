"""Account deletion: permanently purge app data, S3 objects, and the Clerk user."""

from __future__ import annotations

import logging

import requests
from flask import Blueprint, current_app, g, jsonify, request

from ..auth import require_auth
from ..config import Config
from ..services import s3_audio, s3_avatar, s3_vinyl
from ..services.container import get_services
from ._helpers import api_error, api_error_from_exception

bp = Blueprint("account", __name__)
log = logging.getLogger(__name__)

CLERK_API_BASE = "https://api.clerk.com/v1"


def _delete_clerk_user(user_id: str) -> bool:
    """Best-effort Clerk deletion. Missing secret/404 is treated as success."""
    if not Config.CLERK_SECRET_KEY:
        return False

    try:
        response = requests.delete(
            f"{CLERK_API_BASE}/users/{user_id}",
            headers={"Authorization": f"Bearer {Config.CLERK_SECRET_KEY}"},
            timeout=10,
        )
    except requests.RequestException as exc:
        log.warning("Clerk deletion request failed for %s: %s", user_id, exc)
        return False

    if response.status_code in (200, 204, 404):
        return True

    log.warning(
        "Clerk deletion returned %s for %s: %s",
        response.status_code,
        user_id,
        response.text[:300],
    )
    return False


def _delete_storage_keys(keys: dict[str, list[str]]) -> list[str]:
    """Delete S3 objects first; return failed keys so the DB purge is not partial."""
    failures: list[str] = []
    if not Config.S3_BUCKET:
        return failures

    for key in keys.get("audio", []):
        try:
            s3_audio.delete_object(storage_key=key)
        except Exception as exc:  # noqa: BLE001 - report every failed key
            log.warning("Failed to delete audio object %s: %s", key, exc)
            failures.append(key)

    for key in keys.get("vinyl", []):
        try:
            s3_vinyl.delete_object(storage_key=key)
        except Exception as exc:  # noqa: BLE001
            log.warning("Failed to delete vinyl image %s: %s", key, exc)
            failures.append(key)

    for key in keys.get("avatar", []):
        try:
            s3_avatar.delete_avatar(storage_key=key)
        except Exception as exc:  # noqa: BLE001
            log.warning("Failed to delete avatar %s: %s", key, exc)
            failures.append(key)

    return failures


@bp.delete("/account")
@require_auth
def delete_account():
    """Permanently delete the signed-in user's account data.

    Requires a literal ``{"confirm": "DELETE"}`` body. S3 cleanup happens
    before the SQL transaction so a failure can be retried without leaving
    orphaned personal audio behind; the DB purge itself is one transaction.
    """
    user_id = g.user_id
    payload = request.get_json(silent=True) or {}
    if payload.get("confirm") != "DELETE":
        return api_error("Type DELETE to confirm account deletion", 400)

    svc = get_services()
    testing = bool(current_app.config.get("TESTING"))
    keys = svc.storage.collect_user_storage_keys(user_id)

    if not testing:
        failures = _delete_storage_keys(keys)
        if failures:
            return api_error(
                "Some stored files could not be deleted. Nothing was removed; try again.",
                503,
            )

    try:
        counts = svc.storage.purge_user_data(user_id)
    except Exception as e:
        return api_error_from_exception(e)

    clerk_deleted = False
    if not testing:
        clerk_deleted = _delete_clerk_user(user_id)

    return jsonify(
        {
            "deleted": True,
            "clerk_deleted": clerk_deleted,
            "purged": counts,
            "storage_objects": sum(len(value) for value in keys.values()),
        }
    )
