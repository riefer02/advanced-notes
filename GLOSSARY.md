# Chisos Glossary

This glossary defines project-specific terms for developers and AI agents working with the codebase.

## Core Entities

### Note
An audio or manually created note. `notes.folder_path` and `notes.tags` remain JSON/text
compatibility caches next to the normalized folder and tag tables.

- `id`: UUID primary key
- `user_id`: Clerk user ID (multi-tenancy key)
- `title`, `content`: Display title and note body
- `summary`: AI-generated summary
- `folder_path` / `folder_id`: Folder path cache and FK to `folders`
- `tags`: JSON cache of tag names (see `note_tags`)
- `source`: `audio` | `manual` | `import`
- `language`, `version`, `model_version`: Provenance metadata
- `pinned_at`, `archived_at`, `deleted_at`: Lifecycle timestamps (null when active)

### NoteRevision
Snapshot of a note taken on each edit. Used for history and restore.

### Folder
Per-user folder entity in the `folders` table (`path`, `name`, `parent_path`, unique per user).
`notes.folder_path` is kept as a read cache for compatibility.

### Tag
Normalized per-user tag in `tags` (`name`, `name_norm`, unique per user) linked to notes through
the `note_tags` join table. Matches are case-insensitive via `name_norm`.

### Transcript
Raw ASR output stored separately from the note body, optionally linked to a note and its audio clip.

### AudioClip
Metadata for audio files stored in S3. The audio bytes live in object storage, not the database.
- `status`: `pending` (upload incomplete), `ready` (playable), `failed`
- `bucket` / `storage_key`: S3 location
- `note_id`: Links the clip to its transcribed note

### Digest
AI-generated summary of recent notes, used to catch up on activity.

### Todo
Action item extracted from note content by AI or created manually.
- `status`: `suggested` (needs review), `accepted` (active), `completed`
- `confidence`: AI extraction confidence
- `note_id`: Source note (nullable for manual todos or deleted notes)

### MealEntry / MealItem
A transcribed meal (`meal_type`, `meal_date`, optional `meal_time`, `transcription`) and its
individually extracted items (`name`, `portion`, `confidence`).

### VinylRecord / VinylImage / VinylTrack
A record in the vinyl library, its S3-backed cover/photo images, and its track listing.

### UserProfile
Display identity for sharing: `display_name`, unique `username`, `email`, bio, avatar, and
`discoverable` (whether other users can find them).

### Friendship
Request/accept link between two users. `pair_key` normalizes the unordered pair so duplicate
requests are impossible; `status` is `pending` or `accepted`.

### ResourceShare
Grant of a friend's resource: `resource_type` (`vinyl_library` | `meal_calendar`),
`permission` (`view` | `edit`), and `status` (`pending` | `accepted`). A null `resource_id`
means the whole collection/calendar.

## Services

### Storage (NoteStorage)
SQLAlchemy-based data access layer in `backend/app/services/storage/` (facade + per-feature mixins).
All methods take `user_id` as first parameter for multi-tenancy isolation.

### Services (container)
Dependency injection container holding all service instances. Access via `get_services()`.
Located at `backend/app/services/container.py`.

### EmbeddingsService
Generates vector embeddings for semantic search using the OpenAI API, stored in
`note_embeddings` (and the meal/vinyl embedding tables).

### AICategorizationService
Uses GPT to suggest folder paths and tags, and to extract todos from transcriptions.

### AskService
Hybrid retrieval service combining filters, full-text search, and semantic search to answer
questions about notes.

## Authentication

### user_id
Clerk user ID extracted from the JWT `sub` claim. Every database query filters by `user_id`
for multi-tenancy isolation.

### @require_auth
Decorator that validates the JWT and sets `g.user_id`. All API endpoints except `/api/health`
require auth.

### @require_audio_clips
Decorator that checks whether the `AUDIO_CLIPS_ENABLED` feature flag is on.

## Patterns

### User Isolation
All tables have a `user_id` column. All storage methods require `user_id` as the first parameter.
Never query without user context.

### Testing Seam
When `app.config["TESTING"] == True`, auth is bypassed and `X-Test-User-Id` is used instead of a JWT.

### Request Validation
Pydantic models in `backend/app/services/models.py` validate request bodies. Use
`CreateTodoRequest`, `UpdateNoteRequest`, etc.

## Frontend Patterns

### TanStack Query
Data fetching library. Hooks in `frontend/src/hooks/` wrap API calls with caching, loading states,
and invalidation.

### TanStack Router
File-based routing. Routes are `.tsx` files in `frontend/src/routes/`; the route tree is generated.

### QueryStateRenderer
Component that handles loading/error/empty states for query data. Use it instead of manual
`if (isLoading)` checks.

### EmptyState
Consistent empty-state component for "no results" or "no items" UI.

## Configuration

Application settings live in `backend/app/config.py` (`Config`), including limits such as
`MAX_AUDIO_BYTES`, `MAX_IMAGE_BYTES`, and `MAX_AVATAR_BYTES`. Request budgets and quotas are
handled by `backend/app/services/rate_limit.py` and the usage tracking services.
