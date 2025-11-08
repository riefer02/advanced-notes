import io
from flask import Blueprint, request, jsonify
from .asr import transcribe_bytes

bp = Blueprint("api", __name__)


@bp.post("/transcribe")
def transcribe():
    """
    Transcribe audio from uploaded file or raw bytes.

    Accepts:
        - multipart/form-data with 'file' field
        - raw audio bytes in request body

    Returns:
        JSON: {"text": str, "meta": dict}
    """
    # Check for file upload
    if "file" in request.files:
        data = request.files["file"].read()
    else:
        # Raw bytes in body
        data = request.get_data()

    if not data:
        return jsonify({"error": "No audio data provided"}), 400

    try:
        text, meta = transcribe_bytes(data)
        return jsonify({"text": text, "meta": meta})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.get("/health")
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"})
