"""
Data models for notes storage.

Uses Pydantic for validation and serialization.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


class NoteMetadata(BaseModel):
    """Metadata for creating/updating a note"""
    title: str = Field(..., min_length=1, max_length=500)
    folder_path: str = Field(..., description="Folder path (e.g., 'blog-ideas/react')")
    tags: List[str] = Field(default_factory=list, description="List of tags")
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0, description="AI categorization confidence")
    transcription_duration: Optional[float] = Field(None, ge=0.0, description="Audio duration in seconds")
    model_version: Optional[str] = Field(None, description="ASR model version")


class Note(BaseModel):
    """Complete note with all fields"""
    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    content: str
    folder_path: str
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    word_count: int = Field(default=0, ge=0)
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    transcription_duration: Optional[float] = Field(None, ge=0.0)
    model_version: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class NoteListItem(BaseModel):
    """Lightweight note item for list views (without content)"""
    id: str
    title: str
    folder_path: str
    tags: List[str]
    created_at: datetime
    updated_at: datetime
    word_count: int
    confidence: Optional[float] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class FolderNode(BaseModel):
    """Folder in the hierarchy tree"""
    name: str
    path: str
    note_count: int
    subfolders: List['FolderNode'] = Field(default_factory=list)


class FolderStats(BaseModel):
    """Statistics for a folder"""
    path: str
    note_count: int
    total_duration: float
    avg_confidence: Optional[float]
    most_common_tags: List[str]


class SearchResult(BaseModel):
    """Search result with ranking"""
    note: NoteListItem
    rank: float = Field(description="Search relevance score")
    snippet: str = Field(description="Matching text snippet")


# Update forward references for recursive models
FolderNode.model_rebuild()

