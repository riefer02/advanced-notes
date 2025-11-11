"""
Audio transcription using OpenAI GPT-4o-mini-transcribe.

Uses OpenAI's latest transcription model for easy deployment.
Model: gpt-4o-mini-transcribe (newer, higher quality than whisper-1)
"""

import tempfile
import os
from openai import OpenAI
from .config import Config

# Initialize OpenAI client
_client = None

def _get_client():
    """Get or create OpenAI client."""
    global _client
    if _client is None:
        if not Config.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is required for transcription")
        _client = OpenAI(api_key=Config.OPENAI_API_KEY)
    return _client


def transcribe_bytes(audio_bytes: bytes, content_type: str = None):
    """
    Transcribe audio from raw bytes using OpenAI GPT-4o-mini-transcribe.
    
    Supports: mp3, mp4, mpeg, mpga, m4a, wav, webm (up to 25MB)
    
    Args:
        audio_bytes: Audio file bytes
        content_type: MIME type of audio (e.g., 'audio/webm', 'audio/mp4')
    
    Returns:
        tuple: (transcribed_text, metadata_dict)
    """
    client = _get_client()
    
    # Map MIME types to file extensions
    mime_to_ext = {
        'audio/webm': '.webm',
        'audio/mp4': '.mp4',
        'audio/m4a': '.m4a',
        'audio/mpeg': '.mp3',
        'audio/mp3': '.mp3',
        'audio/wav': '.wav',
        'audio/wave': '.wav',
        'audio/ogg': '.ogg',
        'audio/x-m4a': '.m4a',
    }
    
    # Get file extension from content type, default to .webm
    extension = '.webm'
    if content_type:
        # Handle content types with codecs (e.g., "audio/webm;codecs=opus")
        base_type = content_type.split(';')[0].strip().lower()
        extension = mime_to_ext.get(base_type, '.webm')
    
    # OpenAI API requires a file object with a filename
    # Create temporary file with appropriate extension
    with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as temp_file:
        temp_file.write(audio_bytes)
        temp_path = temp_file.name
    
    try:
        # Call OpenAI GPT-4o-mini-transcribe API
        # Using json response format (text and verbose_json not supported by gpt-4o models)
        with open(temp_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                model="gpt-4o-mini-transcribe",
                file=audio_file,
                response_format="json",  # gpt-4o models support json or text
            )
        
        # Extract text and metadata
        text = response.text
        
        meta = {
            "device": "openai-api",
            "model": "gpt-4o-mini-transcribe",
            "language": response.language if hasattr(response, 'language') else None,
            "duration": response.duration if hasattr(response, 'duration') else None,
            "duration_sec": response.duration if hasattr(response, 'duration') else None,
        }
        
        return text, meta
        
    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.unlink(temp_path)
