from flask import Blueprint, jsonify

bp = Blueprint("health", __name__)


@bp.get("/health")
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})
