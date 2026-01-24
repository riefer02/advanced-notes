"""
Data models for notes storage.

Uses Pydantic for validation and serialization.
"""

from datetime import datetime
from uuid import uuid4

from pydantic import BaseModel, Field


class NoteMetadata(BaseModel):
    """Metadata for creating/updating a note"""
    title: str = Field(..., min_length=1, max_length=500)
    folder_path: str = Field(..., description="Folder path (e.g., 'blog-ideas/react')")
    tags: list[str] = Field(default_factory=list, description="List of tags")
    confidence: float | None = Field(None, ge=0.0, le=1.0, description="AI categorization confidence")
    transcription_duration: float | None = Field(None, ge=0.0, description="Audio duration in seconds")
    model_version: str | None = Field(None, description="ASR model version")


class Note(BaseModel):
    """Complete note with all fields"""
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str = Field(..., description="Clerk user ID")
    title: str
    content: str
    folder_path: str
    tags: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    word_count: int = Field(default=0, ge=0)
    confidence: float | None = Field(None, ge=0.0, le=1.0)
    transcription_duration: float | None = Field(None, ge=0.0)
    model_version: str | None = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class Digest(BaseModel):
    """Digest of recent notes"""
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str = Field(..., description="Clerk user ID")
    content: str
    created_at: datetime = Field(default_factory=datetime.now)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class AskHistory(BaseModel):
    """Persisted Ask Notes query/result (compact)."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str = Field(..., description="Clerk user ID")
    query: str
    query_plan_json: str
    answer_markdown: str
    cited_note_ids_json: str
    source_scores_json: str | None = None
    created_at: datetime = Field(default_factory=datetime.now)

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class FolderNode(BaseModel):
    """Folder in the hierarchy tree"""
    name: str
    path: str
    note_count: int
    subfolders: list['FolderNode'] = Field(default_factory=list)


class FolderStats(BaseModel):
    """Statistics for a folder"""
    path: str
    note_count: int
    total_duration: float
    avg_confidence: float | None
    most_common_tags: list[str]


class SearchResult(BaseModel):
    """Search result with ranking"""
    note: Note
    rank: float = Field(description="Search relevance score")
    snippet: str = Field(description="Matching text snippet")


class AudioClip(BaseModel):
    """Audio clip metadata (audio bytes stored in object storage)."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str = Field(..., description="Clerk user ID")
    note_id: str | None = Field(None, description="Associated note ID (optional)")

    bucket: str | None = None
    storage_key: str

    mime_type: str
    bytes: int = Field(..., ge=1)
    duration_ms: int | None = Field(None, ge=0)

    status: str = Field(default="pending")
    created_at: datetime = Field(default_factory=datetime.now)

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class UserSettings(BaseModel):
    """User settings including todo preferences."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str = Field(..., description="Clerk user ID")
    auto_accept_todos: bool = Field(default=False, description="Auto-accept extracted todos")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class Todo(BaseModel):
    """Todo item extracted from notes or created manually."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str = Field(..., description="Clerk user ID")
    note_id: str | None = Field(None, description="Source note ID (nullable)")
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = Field(None, description="Optional longer description")
    status: str = Field(default="suggested", description="suggested | accepted | completed")
    confidence: float | None = Field(None, ge=0.0, le=1.0, description="AI extraction confidence")
    extraction_context: str | None = Field(None, description="Context from note where todo was extracted")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    completed_at: datetime | None = Field(None, description="When the todo was completed")

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


# Update forward references for recursive models
FolderNode.model_rebuild()


# ============================================================================
# REQUEST VALIDATION MODELS
# ============================================================================


class CreateTodoRequest(BaseModel):
    """Request body for creating a new todo."""
    title: str = Field(..., min_length=1, max_length=500, description="Todo title")
    description: str | None = Field(None, max_length=2000, description="Optional description")
    note_id: str | None = Field(None, description="Associated note ID")


class UpdateTodoRequest(BaseModel):
    """Request body for updating an existing todo."""
    title: str | None = Field(None, min_length=1, max_length=500, description="New title")
    description: str | None = Field(None, max_length=2000, description="New description")


class UpdateNoteRequest(BaseModel):
    """Request body for updating an existing note."""
    content: str | None = Field(None, min_length=1, description="Note content")
    title: str | None = Field(None, min_length=1, max_length=500, description="Note title")
    folder_path: str | None = Field(None, description="Folder path")
    tags: list[str] | None = Field(None, description="List of tags")


class UpdateSettingsRequest(BaseModel):
    """Request body for updating user settings."""
    auto_accept_todos: bool | None = Field(None, description="Auto-accept extracted todos")


class AskRequest(BaseModel):
    """Request body for asking questions about notes."""
    query: str = Field(..., min_length=1, max_length=2000, description="The question to ask")
    max_results: int = Field(default=12, ge=1, le=50, description="Maximum results to return")
    debug: bool = Field(default=False, description="Include debug info in response")


class AudioClipUploadRequest(BaseModel):
    """Request body for creating a pending audio clip upload."""
    mime_type: str = Field(..., min_length=1, description="MIME type of the audio")
    bytes: int = Field(..., ge=1, description="Size in bytes")
    note_id: str | None = Field(None, description="Associated note ID")
    duration_ms: int | None = Field(None, ge=0, description="Duration in milliseconds")


# ============================================================================
# MEAL TRACKING MODELS
# ============================================================================


class MealItem(BaseModel):
    """A food item within a meal entry"""
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str = Field(..., description="Clerk user ID")
    meal_entry_id: str = Field(..., description="Parent meal entry ID")
    name: str = Field(..., min_length=1, max_length=255, description="Food item name")
    portion: str | None = Field(None, max_length=100, description="Portion/quantity")
    confidence: float | None = Field(None, ge=0.0, le=1.0, description="AI extraction confidence")
    created_at: datetime = Field(default_factory=datetime.now)

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class MealEntry(BaseModel):
    """Complete meal entry with metadata"""
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str = Field(..., description="Clerk user ID")
    meal_type: str = Field(..., description="breakfast, lunch, dinner, or snack")
    meal_date: str = Field(..., description="Date in ISO format (YYYY-MM-DD)")
    meal_time: str | None = Field(None, description="Time in HH:MM format")
    transcription: str = Field(..., description="Original transcription")
    confidence: float | None = Field(None, ge=0.0, le=1.0, description="AI extraction confidence")
    transcription_duration: float | None = Field(None, ge=0.0, description="Audio duration in seconds")
    model_version: str | None = None
    items: list[MealItem] = Field(default_factory=list, description="Food items in this meal")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class MealEntryMetadata(BaseModel):
    """Metadata for creating/updating a meal entry"""
    meal_type: str = Field(..., description="breakfast, lunch, dinner, or snack")
    meal_date: str = Field(..., description="Date in ISO format (YYYY-MM-DD)")
    meal_time: str | None = Field(None, description="Time in HH:MM format")
    confidence: float | None = Field(None, ge=0.0, le=1.0, description="AI extraction confidence")
    transcription_duration: float | None = Field(None, ge=0.0, description="Audio duration in seconds")
    model_version: str | None = None


class UpdateMealEntryRequest(BaseModel):
    """Request body for updating an existing meal entry"""
    meal_type: str | None = Field(None, description="New meal type")
    meal_date: str | None = Field(None, description="New date in ISO format")
    meal_time: str | None = Field(None, description="New time in HH:MM format")
    transcription: str | None = Field(None, description="Updated transcription")


class CreateMealItemRequest(BaseModel):
    """Request body for adding a food item to a meal"""
    name: str = Field(..., min_length=1, max_length=255, description="Food item name")
    portion: str | None = Field(None, max_length=100, description="Portion/quantity")


class UpdateMealItemRequest(BaseModel):
    """Request body for updating a food item"""
    name: str | None = Field(None, min_length=1, max_length=255, description="New name")
    portion: str | None = Field(None, max_length=100, description="New portion")


# ============================================================================
# USAGE TRACKING MODELS
# ============================================================================


class UsageSummaryResponse(BaseModel):
    """API response for current usage summary"""
    user_id: str
    period_start: datetime
    period_end: datetime
    transcription_minutes_used: float
    transcription_minutes_limit: int
    ai_calls_used: int
    ai_calls_limit: int
    estimated_cost_usd: float
    tier: str

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class QuotaExceededError(BaseModel):
    """Error response when quota is exceeded"""
    error: str = "Monthly quota exceeded"
    quota: dict = Field(description="Quota details including service, used, limit, unit, and resets_at")


class UsageRecordResponse(BaseModel):
    """API response for a single usage record"""
    id: str
    user_id: str
    service_type: str
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    audio_duration_seconds: float | None = None
    endpoint: str | None = None
    estimated_cost_usd: float | None = None
    created_at: datetime

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


# ============================================================================
# FEEDBACK MODELS
# ============================================================================


class FeedbackResponse(BaseModel):
    """API response for a feedback submission"""
    id: str
    user_id: str
    feedback_type: str
    title: str
    description: str | None = None
    rating: int | None = None
    created_at: datetime

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class CreateFeedbackRequest(BaseModel):
    """Request body for submitting feedback"""
    feedback_type: str = Field(..., description="bug, feature, or general")
    title: str = Field(..., min_length=1, max_length=255, description="Feedback title")
    description: str | None = Field(None, max_length=5000, description="Detailed description")
    rating: int | None = Field(None, ge=1, le=5, description="Optional 1-5 rating")
