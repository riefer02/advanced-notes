# Chisos Glossary

This glossary defines project-specific terms for developers and AI agents working with the codebase.

## Core Entities

### Note
A voice note transcription stored in the database. Contains:
- `id`: UUID primary key
- `user_id`: Clerk user ID (foreign key for multi-tenancy)
- `title`: AI-generated title
- `content`: Transcribed text content
- `folder_path`: Organization path (e.g., "work/meetings")
- `tags`: JSON array of AI-suggested tags
- `word_count`: Word count for UI display
- `confidence`: AI categorization confidence (0.0-1.0)
- `transcription_duration`: Audio duration in seconds

### Folder
Virtual organization structure derived from note `folder_path` values. Not a separate database table - folders are computed from note paths. Example: "work/meetings" creates virtual folders "work" and "work/meetings".

### Tag
Searchable label attached to notes. Stored as JSON array in `Note.tags`. Tags are lowercase, kebab-case (e.g., "machine-learning", "q4-planning").

### AudioClip
Metadata for audio files stored in S3. The actual audio bytes are in object storage, not the database.
- `status`: "pending" (uploading), "ready" (playable), "failed"
- `storage_key`: S3 object key
- `note_id`: Links clip to its transcribed note

### Digest
AI-generated summary of recent notes. Useful for catching up on activity.

### Todo
Action item extracted from note content by AI.
- `status`: "suggested" (AI-extracted), "accepted" (user confirmed), "completed"
- `confidence`: AI extraction confidence
- `note_id`: Source note (nullable for manually created todos)

## Services

### Storage (NoteStorage)
SQLAlchemy-based data access layer. All methods take `user_id` as first parameter for multi-tenancy isolation. Located at `backend/app/services/storage.py`.

### Container (ServiceContainer)
Dependency injection container holding all service instances. Access via `get_services()`. Located at `backend/app/services/container.py`.

### EmbeddingsService
Generates vector embeddings for semantic search using OpenAI API. Stores embeddings in `note_embeddings` table.

### AICategorizationService
Uses GPT to suggest folder paths, tags, and extract todos from transcriptions.

### AskService
Hybrid retrieval service combining full-text search (FTS) and semantic search to answer questions about notes.

## Authentication

### user_id
Clerk user ID extracted from JWT `sub` claim. Every database query filters by `user_id` for multi-tenancy isolation.

### @require_auth
Decorator that validates JWT and sets `g.user_id`. All API endpoints except `/api/health` require auth.

### @require_audio_clips
Decorator that checks if `AUDIO_CLIPS_ENABLED` feature flag is true.

## Patterns

### User Isolation
All tables have `user_id` column. All storage methods require `user_id` as first parameter. Never query without user context.

### Testing Seam
When `app.config["TESTING"] == True`, auth is bypassed and `X-Test-User-Id` header is used instead of JWT.

### Request Validation
Pydantic models in `backend/app/services/models.py` validate request bodies. Use `CreateTodoRequest`, `UpdateNoteRequest`, etc.

## Frontend Patterns

### TanStack Query
Data fetching library. Hooks in `frontend/src/hooks/` wrap API calls with caching, loading states, and invalidation.

### TanStack Router
File-based routing. Routes are `.tsx` files in `frontend/src/routes/`. Route tree auto-generated.

### QueryStateRenderer
Component that handles loading/error/empty states for query data. Use instead of manual `if (isLoading)` checks.

### EmptyState
Consistent empty state component for "no results" or "no items" UI.

## Configuration

### SearchConfig
Constants for search operations: `MAX_SEMANTIC_CANDIDATES`, `MAX_FTS_CANDIDATES`, etc.

### PaginationConfig
Constants for pagination: `DEFAULT_LIMIT`, `MAX_LIMIT`, etc.

### ContentConfig
Constants for content limits: `MAX_TITLE_LENGTH`, `MAX_QUERY_LENGTH`, etc.
