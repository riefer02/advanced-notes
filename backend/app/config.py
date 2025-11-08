"""
Configuration management for the application.

Loads environment variables and provides centralized config access.
"""

import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Application configuration"""
    
    # Flask settings
    FLASK_ENV: str = os.getenv("FLASK_ENV", "development")
    DEBUG: bool = FLASK_ENV == "development"
    
    # OpenAI settings (used for both transcription and GPT categorization)
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    
    # Transcription settings
    # Using gpt-4o-mini-transcribe (newer, higher quality than whisper-1)
    WHISPER_MODEL: str = "gpt-4o-mini-transcribe"
    
    # Storage settings (database-only, no file system storage)
    BASE_DIR: Path = Path(__file__).parent.parent  # backend/
    DB_PATH: Path = BASE_DIR / ".notes.db"
    
    # Categorization settings
    CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.7"))
    DEFAULT_FOLDERS: list = ["inbox", "archive"]
    MAX_NOTES_PER_FOLDER: int = 50
    
    @classmethod
    def validate(cls):
        """Validate required configuration"""
        errors = []
        
        if not cls.OPENAI_API_KEY:
            errors.append("OPENAI_API_KEY is not set")
        
        if errors:
            raise ValueError(f"Configuration errors: {', '.join(errors)}")


# Create config instance
config = Config()

