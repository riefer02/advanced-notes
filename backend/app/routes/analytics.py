"""Self-hosted product analytics ingestion.

Privacy rules for this module:
- Events belong to the authenticated user; no anonymous or cross-user writes.
- ``properties`` must be IDs, enums, booleans, or counts. Never send note or
  meal text, email addresses, names, or any other free-form personal data.
- The stored record is only (user_id, name, properties_json, created_at).
  There is no IP address, user agent, referrer, or session fingerprint.
"""

from __future__ import annotations

import json
import re

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services.container import get_services
from ._helpers import api_error, api_error_from_exception

bp = Blueprint("analytics", __name__)

MAX_EVENTS_PER_BATCH = 50
MAX_EVENT_NAME_LENGTH = 64
MAX_PROPERTIES_BYTES = 2048
MAX_PROPERTY_KEYS = 20

# Lowercase snake_case, optionally dot-separated for namespacing
# (e.g. "search.result_opened" or "search.opened").
_EVENT_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$")


def _validate_event(raw: object, index: int) -> tuple[dict | None, str | None]:
    """Return ``(event, error)`` for one payload entry."""
    if not isinstance(raw, dict):
        return None, f"events[{index}] must be an object"

    name = raw.get("name")
    if not isinstance(name, str) or not name:
        return None, f"events[{index}].name is required"
    if len(name) > MAX_EVENT_NAME_LENGTH:
        return None, (
            f"events[{index}].name must be {MAX_EVENT_NAME_LENGTH} characters or less"
        )
    if not _EVENT_NAME_RE.match(name):
        return None, (
            f"events[{index}].name must be lowercase snake_case or dot-separated"
        )

    properties = raw.get("properties")
    if properties is not None:
        if not isinstance(properties, dict):
            return None, f"events[{index}].properties must be an object"
        if len(properties) > MAX_PROPERTY_KEYS:
            return None, (
                f"events[{index}].properties must have {MAX_PROPERTY_KEYS} keys or fewer"
            )
        try:
            encoded = json.dumps(properties, separators=(",", ":"))
        except (TypeError, ValueError):
            return None, f"events[{index}].properties must be JSON-serializable"
        if len(encoded.encode("utf-8")) > MAX_PROPERTIES_BYTES:
            return None, (
                f"events[{index}].properties must be {MAX_PROPERTIES_BYTES} bytes or less"
            )

    return {"name": name, "properties": properties}, None


@bp.post("/analytics/events")
@require_auth
def record_events():
    """Accept a small batch of product analytics events (202 on success)."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return api_error("No data provided", 400)

        raw_events = data.get("events")
        if not isinstance(raw_events, list):
            return api_error("events must be a list", 400)
        if not raw_events:
            return api_error("events must not be empty", 400)
        if len(raw_events) > MAX_EVENTS_PER_BATCH:
            return api_error(
                f"events must contain at most {MAX_EVENTS_PER_BATCH} entries", 400
            )

        events: list[dict] = []
        for index, raw in enumerate(raw_events):
            event, error = _validate_event(raw, index)
            if error is not None or event is None:
                return api_error(error or "Invalid event", 400)
            events.append(event)

        accepted = svc.storage.record_analytics_events(user_id, events)
        return jsonify({"accepted": accepted}), 202

    except Exception as e:  # noqa: BLE001 - routes translate to a safe response
        return api_error_from_exception(e)
