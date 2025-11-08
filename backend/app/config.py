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
    
    # OpenAI settings
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    
    # ASR Model settings
    ASR_MODEL_NAME: str = "nvidia/parakeet-tdt-0.6b-v3"
    
    # Storage settings  
    BASE_DIR: Path = Path(__file__).parent.parent.parent
    NOTES_DIR: Path = BASE_DIR / "notes"
    
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
    
    @classmethod
    def init_directories(cls):
        """Create necessary directories if they don't exist"""
        cls.NOTES_DIR.mkdir(parents=True, exist_ok=True)
        
        # Create default folders
        for folder in cls.DEFAULT_FOLDERS:
            (cls.NOTES_DIR / folder).mkdir(exist_ok=True)


# Create config instance
config = Config()

