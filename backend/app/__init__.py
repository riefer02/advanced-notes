import os

from flask import Flask
from flask_cors import CORS

from .config import Config
from .services.container import Services, create_services


def create_app(*, services: Services | None = None, testing: bool = False):
    app = Flask(__name__)

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

    from .routes import bp as api_bp

    app.register_blueprint(api_bp, url_prefix="/api")

    return app
