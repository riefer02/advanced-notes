import base64
import hashlib
from contextlib import suppress
from uuid import uuid4

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services import s3_vinyl
from ..services.container import get_services
from ..services.embeddings import vector_to_json, vector_to_pg_literal
from ._helpers import (
    _maybe_send_cost_alert,
    api_error,
    parse_pagination,
    require_quota,
    resolve_target_user,
)

bp = Blueprint("vinyl", __name__)


def _enrich_vinyl_record(record_dict: dict) -> dict:
    """Add cover_image_url to a serialised vinyl record if it has a cover image."""
    cover_id = record_dict.get("cover_image_id")
    if cover_id and s3_vinyl.s3_available():
        for img in record_dict.get("images", []):
            if img.get("id") == cover_id and img.get("status") == "ready":
                try:
                    dl = s3_vinyl.presign_get_object(storage_key=img["storage_key"])
                    record_dict["cover_image_url"] = dl.url
                except Exception:
                    pass
                break
    if "cover_image_url" not in record_dict:
        record_dict["cover_image_url"] = None
    return record_dict


@bp.post("/vinyl")
@require_auth
def create_vinyl_record():
    """Create a new vinyl record (manual entry)."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json()
        if not data:
            return api_error("No data provided", 400)

        artist = (data.get("artist") or "").strip()
        if not artist:
            return api_error("'artist' is required", 400)

        album_title = (data.get("album_title") or "").strip()
        if not album_title:
            return api_error("'album_title' is required", 400)

        record_id = svc.storage.save_vinyl_record(
            user_id,
            artist=artist,
            album_title=album_title,
            release_year=data.get("release_year"),
            genre=data.get("genre"),
            label=data.get("label"),
            catalog_number=data.get("catalog_number"),
            format=data.get("format"),
            pressing_country=data.get("pressing_country"),
            color=data.get("color"),
            condition=data.get("condition"),
            notes=data.get("notes"),
        )

        record = svc.storage.get_vinyl_record(user_id, record_id)
        return jsonify(record.model_dump() if record else {"id": record_id}), 201

    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/vinyl")
@require_auth
def list_vinyl_records():
    """List vinyl records with optional filtering."""
    svc = get_services()
    target_user = resolve_target_user("vinyl_library")
    if not isinstance(target_user, str):
        return target_user

    try:
        limit, offset = parse_pagination(default_limit=50, max_limit=100)

        genre = request.args.get("genre")
        decade = request.args.get("decade")
        fmt = request.args.get("format")
        search = request.args.get("search")
        sort_by = request.args.get("sort_by", "created_at")

        decade_int = None
        if decade:
            try:
                decade_int = int(decade)
            except ValueError:
                return api_error("'decade' must be an integer", 400)

        records = svc.storage.list_vinyl_records(
            target_user,
            genre=genre,
            decade=decade_int,
            format=fmt,
            search=search,
            sort_by=sort_by,
            limit=limit,
            offset=offset,
        )

        return jsonify({
            "records": [_enrich_vinyl_record(r.model_dump()) for r in records],
            "total": len(records),
            "limit": limit,
            "offset": offset,
        })

    except Exception as e:
        return api_error(str(e), 500)


# Static paths MUST come before dynamic <record_id> paths
@bp.get("/vinyl/stats")
@require_auth
def get_vinyl_stats():
    """Get collection statistics."""
    svc = get_services()
    target_user = resolve_target_user("vinyl_library")
    if not isinstance(target_user, str):
        return target_user

    try:
        stats = svc.storage.get_vinyl_collection_stats(target_user)
        return jsonify(stats)
    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/vinyl/search")
@require_auth
def search_vinyl():
    """Search vinyl records (text search)."""
    svc = get_services()
    target_user = resolve_target_user("vinyl_library")
    if not isinstance(target_user, str):
        return target_user

    try:
        query = request.args.get("q")
        if not query:
            return api_error("Query parameter 'q' is required", 400)

        limit, offset = parse_pagination(default_limit=50, max_limit=100)

        records = svc.storage.list_vinyl_records(
            target_user,
            search=query,
            limit=limit,
            offset=offset,
        )

        return jsonify({
            "records": [r.model_dump() for r in records],
            "query": query,
            "total": len(records),
        })

    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/vinyl/extract-photos")
@require_auth
@require_quota("ai_calls")
def extract_vinyl_from_photos():
    """Extract vinyl metadata directly from uploaded photos."""
    user_id = g.user_id
    svc = get_services()

    files = request.files.getlist("images")
    if not files:
        return api_error("No images provided", 400)
    if len(files) > 6:
        return api_error("Maximum 6 images allowed", 400)

    allowed_mimes = {"image/jpeg", "image/png", "image/webp", "image/heic"}
    image_urls: list[str] = []
    for f in files:
        mime = f.content_type or "image/jpeg"
        if mime not in allowed_mimes:
            return api_error(f"Unsupported image type: {mime}", 400)
        data = base64.b64encode(f.read()).decode("utf-8")
        image_urls.append(f"data:{mime};base64,{data}")

    try:
        result = svc.vinyl_extractor.extract(image_urls)

        svc.usage_tracking.record_usage(
            user_id=user_id,
            service_type="vinyl_extraction",
            model=svc.vinyl_extractor.model,
            endpoint="/api/vinyl/extract-photos",
        )
        _maybe_send_cost_alert(svc)

        return jsonify(result.model_dump())

    except Exception as e:
        return api_error(str(e), 500)


# Dynamic <record_id> paths come AFTER static paths
@bp.get("/vinyl/<record_id>")
@require_auth
def get_vinyl_record(record_id: str):
    """Get a vinyl record with tracks and images."""
    svc = get_services()
    target_user = resolve_target_user("vinyl_library")
    if not isinstance(target_user, str):
        return target_user

    try:
        record = svc.storage.get_vinyl_record(target_user, record_id)
        if not record:
            return api_error("Vinyl record not found", 404)
        return jsonify(_enrich_vinyl_record(record.model_dump()))
    except Exception as e:
        return api_error(str(e), 500)


@bp.put("/vinyl/<record_id>")
@require_auth
def update_vinyl_record(record_id: str):
    """Update a vinyl record's metadata and optionally replace tracks."""
    user_id = g.user_id
    svc = get_services()

    try:
        data = request.get_json()
        if not data:
            return api_error("No data provided", 400)

        success = svc.storage.update_vinyl_record(
            user_id,
            record_id,
            artist=data.get("artist"),
            album_title=data.get("album_title"),
            release_year=data.get("release_year"),
            genre=data.get("genre"),
            label=data.get("label"),
            catalog_number=data.get("catalog_number"),
            format=data.get("format"),
            pressing_country=data.get("pressing_country"),
            color=data.get("color"),
            condition=data.get("condition"),
            notes=data.get("notes"),
            extraction_status=data.get("extraction_status"),
            extraction_confidence=data.get("extraction_confidence"),
            cover_image_id=data.get("cover_image_id"),
            tracks=data.get("tracks"),
        )

        if not success:
            return api_error("Vinyl record not found", 404)

        # Best-effort embedding refresh
        updated = svc.storage.get_vinyl_record(user_id, record_id)
        if updated:
            try:
                content = f"{updated.artist} - {updated.album_title}"
                if updated.genre:
                    content += f" [{', '.join(updated.genre)}]"
                if updated.label:
                    content += f" ({updated.label})"
                track_titles = [t.title for t in updated.tracks]
                if track_titles:
                    content += " " + " ".join(track_titles)

                vec = svc.embeddings.embed_query(content)
                content_hash = hashlib.sha256(content.encode()).hexdigest()
                embedding_value = (
                    vector_to_pg_literal(vec)
                    if svc.storage.dialect == "postgresql"
                    else vector_to_json(vec)
                )
                svc.storage.upsert_vinyl_embedding(
                    user_id=user_id,
                    vinyl_record_id=record_id,
                    embedding_model=svc.embeddings.model,
                    content_hash=content_hash,
                    embedding_value=embedding_value,
                )
            except Exception as e:
                print(f"Vinyl embedding failed for {record_id}: {e}")

        return jsonify(updated.model_dump() if updated else {})

    except Exception as e:
        return api_error(str(e), 500)


@bp.delete("/vinyl/<record_id>")
@require_auth
def delete_vinyl_record(record_id: str):
    """Delete a vinyl record (cascades images, tracks, embeddings)."""
    user_id = g.user_id
    svc = get_services()

    try:
        warning = None
        try:
            images = svc.storage.list_vinyl_images(user_id, record_id)
            for img in images:
                with suppress(Exception):
                    s3_vinyl.delete_object(storage_key=img.storage_key)
        except Exception as e:
            warning = f"Failed to delete some image objects: {e}"

        success = svc.storage.delete_vinyl_record(user_id, record_id)
        if not success:
            return api_error("Vinyl record not found", 404)

        payload = {"success": True}
        if warning:
            payload["warning"] = warning
        return jsonify(payload)

    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/vinyl/<record_id>/images")
@require_auth
def create_vinyl_image(record_id: str):
    """Upload a vinyl image."""
    user_id = g.user_id
    svc = get_services()

    if not s3_vinyl.s3_available():
        return api_error("Image upload requires S3 storage to be configured", 400)

    try:
        record = svc.storage.get_vinyl_record(user_id, record_id)
        if not record:
            return api_error("Vinyl record not found", 404)

        f = request.files.get("file")
        if not f:
            return api_error("'file' is required", 400)

        image_type = (request.form.get("image_type") or "other").strip()
        valid_types = {"front_cover", "back_cover", "label", "inner_sleeve", "other"}
        if image_type not in valid_types:
            return api_error(f"'image_type' must be one of: {', '.join(sorted(valid_types))}", 400)

        mime_type = f.content_type or "image/jpeg"
        file_data = f.read()
        bytes_value = len(file_data)

        if bytes_value == 0:
            return api_error("Empty file", 400)

        image_id = str(uuid4())
        storage_key = s3_vinyl.object_key_for_image(
            user_id=user_id,
            image_id=image_id,
            mime_type=mime_type,
        )

        s3_vinyl.upload_object(
            storage_key=storage_key,
            content_type=mime_type,
            data=file_data,
        )

        image = svc.storage.create_vinyl_image_pending(
            user_id,
            image_id=image_id,
            vinyl_record_id=record_id,
            image_type=image_type,
            mime_type=mime_type,
            bytes=bytes_value,
            storage_key=storage_key,
        )
        updated = svc.storage.mark_vinyl_image_ready(user_id, image_id)
        return jsonify({"image": (updated or image).model_dump()})

    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/vinyl/<record_id>/images/<image_id>/url")
@require_auth
def get_vinyl_image_url(record_id: str, image_id: str):
    """Get a presigned GET URL for viewing an image."""
    svc = get_services()
    target_user = resolve_target_user("vinyl_library")
    if not isinstance(target_user, str):
        return target_user

    try:
        image = svc.storage.get_vinyl_image(target_user, image_id)
        if not image:
            return api_error("Image not found", 404)
        if image.vinyl_record_id != record_id:
            return api_error("Image does not belong to this record", 400)
        if image.status != "ready":
            return api_error("Image is not ready", 409)

        dl = s3_vinyl.presign_get_object(storage_key=image.storage_key)
        return jsonify({"url": dl.url, "expires_at": dl.expires_at})

    except Exception as e:
        return api_error(str(e), 500)


@bp.delete("/vinyl/<record_id>/images/<image_id>")
@require_auth
def delete_vinyl_image(record_id: str, image_id: str):
    """Delete a vinyl image from S3 and DB."""
    user_id = g.user_id
    svc = get_services()

    try:
        image = svc.storage.get_vinyl_image(user_id, image_id)
        if not image:
            return api_error("Image not found", 404)
        if image.vinyl_record_id != record_id:
            return api_error("Image does not belong to this record", 400)

        warning = None
        try:
            s3_vinyl.delete_object(storage_key=image.storage_key)
        except Exception as e:
            warning = f"Failed to delete image from storage: {e}"
            print(warning)

        success = svc.storage.delete_vinyl_image(user_id, image_id)
        if not success:
            return api_error("Image not found", 404)

        payload = {"success": True}
        if warning:
            payload["warning"] = warning
        return jsonify(payload)

    except Exception as e:
        return api_error(str(e), 500)


@bp.post("/vinyl/<record_id>/extract")
@require_auth
@require_quota("ai_calls")
def extract_vinyl_metadata(record_id: str):
    """Run AI OCR extraction on a record's images."""
    user_id = g.user_id
    svc = get_services()

    try:
        record = svc.storage.get_vinyl_record(user_id, record_id)
        if not record:
            return api_error("Vinyl record not found", 404)

        images = svc.storage.list_vinyl_images(user_id, record_id)
        ready_images = [img for img in images if img.status == "ready"]

        if not ready_images:
            return api_error("No ready images found for this record. Upload images first.", 400)

        image_urls = []
        for img in ready_images:
            dl = s3_vinyl.presign_get_object(storage_key=img.storage_key)
            image_urls.append(dl.url)

        result = svc.vinyl_extractor.extract(image_urls)

        svc.usage_tracking.record_usage(
            user_id=user_id,
            service_type="vinyl_extraction",
            model=svc.vinyl_extractor.model,
            endpoint="/api/vinyl/<id>/extract",
        )
        _maybe_send_cost_alert(svc)

        return jsonify(result.model_dump())

    except Exception as e:
        return api_error(str(e), 500)
