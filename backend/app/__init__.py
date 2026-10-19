import os
from contextlib import suppress

from flask import Flask, jsonify
from flask_cors import CORS

from .config import Config
from .services.container import Services, create_services


def create_app(*, services: Services | None = None, testing: bool = False):
    app = Flask(__name__)

    # Global request-body cap. Individual endpoints enforce tighter limits.
    app.config["MAX_CONTENT_LENGTH"] = Config.MAX_CONTENT_LENGTH

    if testing:
        app.config["TESTING"] = True
    else:
        # Fail fast for misconfigured environments when audio clips are enabled.
        # (We intentionally do NOT require S3 config when the feature flag is off.)
        Config.validate_audio_clips()

    # CORS configuration for development and production
    allowed_origins = [
        "http://localhost:5173",  # Local Vite dev server
        "http://localhost:5175",  # Alternate local port
    ]

    # Add production frontend URL if set
    frontend_url = os.getenv("FRONTEND_URL")
    if frontend_url:
        allowed_origins.append(frontend_url)

    # In development, allow all origins for easier testing
    if os.getenv("FLASK_ENV") == "development":
        CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
    else:
        CORS(app, origins=allowed_origins, supports_credentials=True)

    # Attach dependency container for routes/services.
    #
    # In tests, callers can pass `services=` (or set it later) to avoid initializing
    # OpenAI-backed clients during app creation.
    if services is not None:
        app.extensions["services"] = services
    elif not app.config.get("TESTING"):
        app.extensions["services"] = create_services()

    # Deliver queued admin notifications off the request path. Only the real
    # container gets a worker; tests pass custom services and must not spawn it.
    if not app.config.get("TESTING") and services is None:
        from .services.email_worker import start_email_worker

        start_email_worker(app)

    from .routes import api as api_bp

    app.register_blueprint(api_bp, url_prefix="/api")

    @app.errorhandler(500)
    def handle_500(error):
        from .routes._helpers import report_server_error

        with suppress(Exception):
            report_server_error(getattr(error, "original_exception", None) or error)
        return {"error": "Internal server error"}, 500

    @app.errorhandler(413)
    def handle_413(error):
        return jsonify({"error": "Request body too large"}), 413

    return app
