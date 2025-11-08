import os
from flask import Flask
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    
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
        CORS(app)
    else:
        CORS(app, origins=allowed_origins)
    
    from .routes import bp as api_bp
    app.register_blueprint(api_bp, url_prefix="/api")
    
    return app

