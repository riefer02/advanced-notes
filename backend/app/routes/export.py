"""Full-account data export.

One endpoint returns either a JSON payload or a ZIP containing the JSON plus
one Markdown file per note. Audio binaries are intentionally not included in
this iteration; the README documents that boundary.
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from datetime import UTC, date, datetime

from flask import Blueprint, Response, g, request, send_file

from ..auth import require_auth
from ..services.container import get_services
from ._helpers import api_error, api_error_from_exception

bp = Blueprint("export", __name__)

_NOTE_VIEWS = ("active", "archived", "trash")
_PAGE_SIZE = 100


def _paginate(fetch_page, page_size: int = _PAGE_SIZE):
    """Yield rows from a limit/offset fetcher until a short page."""
    offset = 0
    while True:
        page = fetch_page(limit=page_size, offset=offset)
        if not page:
            return
        yield from page
        offset += len(page)
        if len(page) < page_size:
            return


def _all_notes(storage, user_id: str) -> list[dict]:
    notes: list[dict] = []
    for view in _NOTE_VIEWS:
        for note in _paginate(
            lambda limit, offset, view=view: storage.list_notes(
                user_id, limit=limit, offset=offset, view=view
            )
        ):
            payload = note.model_dump(mode="json")
            payload["view"] = view
            notes.append(payload)
    return notes


def _all_todos(storage, user_id: str) -> list[dict]:
    return [
        todo.model_dump(mode="json")
        for todo in _paginate(
            lambda limit, offset: storage.list_todos(user_id, limit=limit, offset=offset)
        )
    ]


def _all_meals(storage, user_id: str) -> list[dict]:
    # Meals are date-scoped in storage. A generous range covers every realistic
    # entry while keeping the export read simple.
    return [
        meal.model_dump(mode="json")
        for meal in _paginate(
            lambda limit, offset: storage.list_meals_by_date_range(
                user_id,
                start_date="1900-01-01",
                end_date="2100-12-31",
                limit=limit,
                offset=offset,
            ),
            page_size=500,
        )
    ]


def _all_vinyl(storage, user_id: str) -> list[dict]:
    return [
        record.model_dump(mode="json")
        for record in _paginate(
            lambda limit, offset: storage.list_vinyl_records(
                user_id, limit=limit, offset=offset
            )
        )
    ]


def _all_digests(storage, user_id: str) -> list[dict]:
    return [
        digest.model_dump(mode="json")
        for digest in _paginate(
            lambda limit, offset: storage.list_digests(user_id, limit=limit, offset=offset)
        )
    ]


def _all_ask_history(storage, user_id: str) -> list[dict]:
    return [
        item.model_dump(mode="json")
        for item in _paginate(
            lambda limit, offset: storage.list_ask_history(user_id, limit=limit, offset=offset)
        )
    ]


def _build_payload(storage, user_id: str) -> dict:
    profile = storage.get_user_profile(user_id)
    folders = storage.get_folder_tree(user_id)
    settings = storage.get_user_settings(user_id)

    notes = _all_notes(storage, user_id)
    todos = _all_todos(storage, user_id)
    meals = _all_meals(storage, user_id)
    vinyl = _all_vinyl(storage, user_id)
    digests = _all_digests(storage, user_id)
    ask_history = _all_ask_history(storage, user_id)

    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "user_id": user_id,
        "profile": profile.model_dump(mode="json") if profile else None,
        "settings": settings.model_dump(mode="json") if settings else None,
        "folders": folders.model_dump(mode="json") if folders else None,
        "tags": storage.get_all_tags(user_id),
        "counts": {
            "notes": len(notes),
            "todos": len(todos),
            "meals": len(meals),
            "vinyl": len(vinyl),
            "digests": len(digests),
            "ask_history": len(ask_history),
        },
        "notes": notes,
        "todos": todos,
        "meals": meals,
        "vinyl": vinyl,
        "digests": digests,
        "ask_history": ask_history,
    }


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:60] or "note"


def _note_markdown(note: dict) -> str:
    meta = [
        f"- Created: {note.get('created_at') or ''}",
        f"- Updated: {note.get('updated_at') or ''}",
        f"- Folder: {note.get('folder_path') or ''}",
        f"- Tags: {' '.join(f'#{tag}' for tag in note.get('tags') or [])}",
        f"- Source: {note.get('source') or ''}",
        f"- Status: {note.get('view') or 'active'}",
    ]
    parts = [
        f"# {note.get('title') or 'Untitled note'}",
        "",
        "\n".join(meta),
        "",
        f"> {note['summary']}" if note.get("summary") else None,
        "",
        note.get("content") or "",
        "",
    ]
    return "\n".join(part for part in parts if part is not None)


def _zip_bytes(payload: dict) -> bytes:
    buffer = io.BytesIO()
    readme = "\n".join(
        [
            "Chisos data export",
            f"Generated: {payload['exported_at']}",
            "",
            "Contents:",
            "- data.json: profile, settings, folders, tags, notes, todos, meals, vinyl,",
            "  digests, and Ask history.",
            "- notes/*.md: one Markdown file per note, including metadata and content.",
            "",
            "Audio files are not included in this export. Note text and transcripts are.",
            "",
        ]
    )

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("README.txt", readme)
        archive.writestr(
            "data.json", json.dumps(payload, ensure_ascii=False, indent=2)
        )
        for note in payload["notes"]:
            filename = f"notes/{_slug(note.get('title') or 'note')}-{note['id'][:8]}.md"
            archive.writestr(filename, _note_markdown(note))

    buffer.seek(0)
    return buffer.read()


@bp.get("/export")
@require_auth
def export_account():
    """Download all account data as JSON or a ZIP of JSON + Markdown notes."""
    user_id = g.user_id
    fmt = (request.args.get("format") or "zip").strip().lower()
    if fmt not in {"json", "zip"}:
        return api_error("'format' must be 'json' or 'zip'", 400)

    svc = get_services()
    try:
        payload = _build_payload(svc.storage, user_id)
        stamp = date.today().isoformat()

        if fmt == "json":
            body = json.dumps(payload, ensure_ascii=False, indent=2)
            return Response(
                body,
                mimetype="application/json",
                headers={
                    "Content-Disposition": f'attachment; filename="chisos-export-{stamp}.json"'
                },
            )

        body = _zip_bytes(payload)
        return send_file(
            io.BytesIO(body),
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"chisos-export-{stamp}.zip",
        )
    except Exception as e:
        return api_error_from_exception(e)
