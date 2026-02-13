import json as _json

from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services.ask_service import RetrievedNote
from ..services.container import get_services
from ..services.embeddings import vector_to_json, vector_to_pg_literal
from ..services.folder_utils import extract_folder_paths
from ._helpers import _maybe_send_cost_alert, api_error, parse_pagination, require_quota

bp = Blueprint("ask", __name__)


@bp.post("/ask")
@require_auth
@require_quota("ai_calls")
def ask_notes():
    """Ask a natural-language question about your notes."""
    user_id = g.user_id
    svc = get_services()
    data = request.get_json(silent=True) or {}

    query = (data.get("query") or "").strip()
    if not query:
        return api_error("Body field 'query' is required", 400)

    max_results = int(data.get("max_results", 12) or 12)
    max_results = max(1, min(max_results, 50))
    debug = bool(data.get("debug", False))

    try:
        known_tags = svc.storage.get_all_tags(user_id)
        folder_tree = svc.storage.get_folder_tree(user_id)

        known_folders = extract_folder_paths(folder_tree)

        plan = svc.planner.plan(
            question=query,
            known_tags=known_tags,
            known_folders=known_folders,
            result_limit=max_results,
        )

        q_vec = svc.embeddings.embed_query(plan.semantic_query)
        q_literal = (
            vector_to_pg_literal(q_vec)
            if svc.storage.dialect == "postgresql"
            else vector_to_json(q_vec)
        )

        fts_query = " ".join(plan.keywords).strip() if plan.keywords else plan.semantic_query

        retrieval = svc.storage.retrieve_for_question(
            user_id=user_id,
            fts_query=fts_query,
            query_embedding_literal=q_literal,
            folder_paths=plan.folder_paths,
            include_tags=plan.include_tags,
            exclude_tags=plan.exclude_tags,
            start_date=plan.time_range.start_date if plan.time_range else None,
            end_date=plan.time_range.end_date if plan.time_range else None,
            limit=plan.result_limit,
            embedding_model=svc.embeddings.model,
        )

        warnings: list[str] = []
        if not retrieval:
            warnings.append("No matching notes found for this question.")

        retrieved_notes: list[RetrievedNote] = []
        for item in retrieval:
            note = item["note"]
            excerpt = (note.content or "")[:2000]
            retrieved_notes.append(
                RetrievedNote(
                    note_id=note.id,
                    title=note.title,
                    updated_at=note.updated_at.isoformat()
                    if hasattr(note.updated_at, "isoformat")
                    else str(note.updated_at),
                    tags=note.tags,
                    snippet=item.get("snippet") or "",
                    score=float(item.get("score") or 0.0),
                    content_excerpt=excerpt,
                )
            )

        ask_result = svc.asker.answer(query, plan, retrieved_notes, return_usage=True)
        answer = ask_result.answer

        if ask_result.usage:
            svc.usage_tracking.record_usage(
                user_id=user_id,
                service_type="chat",
                model=ask_result.model,
                prompt_tokens=ask_result.usage.prompt_tokens,
                completion_tokens=ask_result.usage.completion_tokens,
                total_tokens=ask_result.usage.total_tokens,
                endpoint="/api/ask",
            )
            _maybe_send_cost_alert(svc)

        source_scores = {item["note"].id: float(item.get("score") or 0.0) for item in retrieval}
        ask_id = svc.storage.save_ask_history(
            user_id=user_id,
            query=query,
            query_plan_json=plan.model_dump_json(),
            answer_markdown=answer.answer_markdown,
            cited_note_ids_json=_json.dumps(answer.cited_note_ids),
            source_scores_json=_json.dumps(source_scores),
        )

        sources = []
        for item in retrieval:
            note = item["note"]
            sources.append(
                {
                    "note_id": note.id,
                    "title": note.title,
                    "updated_at": note.updated_at.isoformat()
                    if hasattr(note.updated_at, "isoformat")
                    else str(note.updated_at),
                    "tags": note.tags,
                    "snippet": item.get("snippet") or "",
                    "score": float(item.get("score") or 0.0),
                }
            )

        response = {
            "answer_markdown": answer.answer_markdown,
            "query_plan": plan.model_dump(),
            "sources": sources,
            "warnings": warnings,
            "followups": answer.followups,
            "ask_id": ask_id,
        }
        if debug:
            response["debug"] = {
                "fts_query": fts_query,
                "embedding_model": svc.embeddings.model,
            }
        return jsonify(response)
    except Exception as e:
        return api_error(str(e), 500)


# ============================================================================
# DIGEST HISTORY
# ============================================================================


@bp.get("/digests")
@require_auth
def list_digests():
    user_id = g.user_id
    svc = get_services()
    try:
        limit, offset = parse_pagination(default_limit=50, max_limit=100)
        digests = svc.storage.list_digests(user_id, limit=limit, offset=offset)
        return jsonify(
            {
                "digests": [d.model_dump() for d in digests],
                "total": len(digests),
                "limit": limit,
                "offset": offset,
            }
        )
    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/digests/<digest_id>")
@require_auth
def get_digest(digest_id: str):
    user_id = g.user_id
    svc = get_services()
    try:
        digest = svc.storage.get_digest(user_id, digest_id)
        if not digest:
            return api_error("Digest not found", 404)
        return jsonify(digest.model_dump())
    except Exception as e:
        return api_error(str(e), 500)


@bp.delete("/digests/<digest_id>")
@require_auth
def delete_digest(digest_id: str):
    user_id = g.user_id
    svc = get_services()
    try:
        success = svc.storage.delete_digest(user_id, digest_id)
        if not success:
            return api_error("Digest not found", 404)
        return jsonify({"success": True})
    except Exception as e:
        return api_error(str(e), 500)


# ============================================================================
# ASK HISTORY
# ============================================================================


@bp.get("/ask-history")
@require_auth
def list_ask_history():
    user_id = g.user_id
    svc = get_services()
    try:
        limit, offset = parse_pagination(default_limit=50, max_limit=100)
        items = svc.storage.list_ask_history(user_id, limit=limit, offset=offset)
        return jsonify(
            {
                "items": [i.model_dump() for i in items],
                "total": len(items),
                "limit": limit,
                "offset": offset,
            }
        )
    except Exception as e:
        return api_error(str(e), 500)


@bp.get("/ask-history/<ask_id>")
@require_auth
def get_ask_history(ask_id: str):
    user_id = g.user_id
    svc = get_services()
    try:
        item = svc.storage.get_ask_history(user_id, ask_id)
        if not item:
            return api_error("Ask history item not found", 404)
        return jsonify(item.model_dump())
    except Exception as e:
        return api_error(str(e), 500)


@bp.delete("/ask-history/<ask_id>")
@require_auth
def delete_ask_history(ask_id: str):
    user_id = g.user_id
    svc = get_services()
    try:
        success = svc.storage.delete_ask_history(user_id, ask_id)
        if not success:
            return api_error("Ask history item not found", 404)
        return jsonify({"success": True})
    except Exception as e:
        return api_error(str(e), 500)
