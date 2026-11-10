# REST API Reference

Complete API documentation for the Chisos backend.

**Base URL:** `http://localhost:5001/api`

---

## Transcription

### POST `/transcribe`

Transcribe audio and automatically categorize/save to database.

This endpoint requires audio clips to be enabled (`AUDIO_CLIPS_ENABLED=true`) because the backend persists the original audio in object storage.

**Request:**
- **Content-Type:** `multipart/form-data` or `application/octet-stream`
- **Body:** Audio file (WAV, FLAC, OGG, WebM, MP3) or raw audio bytes

**Response:** `200 OK`
```json
{
  "text": "Transcribed text content",
  "meta": {
    "device": "openai-api",
    "model": "gpt-transcribe",
    "language": "en",
    "duration": 3.48
  },
  "audio": {
    "clip_id": "uuid",
    "storage_key": "dev/user_123/uuid.webm"
  },
  "categorization": {
    "note_id": "uuid",
    "action": "create_subfolder",
    "title": "React Performance Optimization",
    "summary": "Notes on improving React performance with useMemo and useCallback.",
    "folder_path": "blog-ideas/react",
    "filename": "optimize-performance-2025-11-08.md",
    "tags": ["react", "performance", "blog"],
    "confidence": 0.92,
    "reasoning": "Content discusses blog post idea about React optimization"
  }
}
```

**Errors:**
- `400`: No audio data provided
- `501`: Audio clips are disabled (enable with `AUDIO_CLIPS_ENABLED=true`)
- `500`: Transcription/categorization error

---

## Audio clips

Audio bytes are stored in object storage (S3/S3-compatible). The database stores clip metadata scoped to the authenticated user.

All endpoints in this section return `501` if audio clips are disabled.

### POST `/audio-clips`

Create a pending audio clip row and return a presigned PUT URL for direct upload.

**Request:** `application/json`
```json
{ "note_id": "optional-note-id", "mime_type": "audio/m4a", "bytes": 1234, "duration_ms": 1000 }
```

**Response:** `200 OK`
```json
{
  "clip": { "id": "uuid", "note_id": "uuid", "mime_type": "audio/m4a", "bytes": 1234, "status": "pending" },
  "upload": { "url": "https://...", "method": "PUT", "headers": { "Content-Type": "audio/m4a" }, "storage_key": "dev/user/uuid.m4a", "expires_at": "..." }
}
```

### POST `/audio-clips/<clip_id>/complete`

Mark a pending clip as ready after the client uploads to object storage.

The backend verifies the upload exists (HEAD) and validates `bytes` and `mime_type` before marking `ready`.

### GET `/audio-clips/<clip_id>/playback`

Return a presigned GET URL for playback.

### DELETE `/audio-clips/<clip_id>`

Delete clip metadata and best-effort delete the stored object.

### GET `/notes/<note_id>/audio`

Convenience endpoint: return the note’s primary (most recent ready) audio clip + playback URL.

---

## Notes

### POST `/notes`

Create a **manual (typed) note** without audio or AI categorization.

**Request Body:**
```json
{
  "title": "Optional title (defaults to the first line)",
  "content": "The note body. Required and must not be blank.",
  "summary": "Optional short summary",
  "folder_path": "inbox",
  "tags": ["ideas", "product"]
}
```

Validation:
- `content` is required (max 200,000 characters).
- `title` defaults to the first non-empty line, max 500 characters.
- `folder_path` defaults to `inbox`; empty path segments are collapsed.
- Tags are lowercased, de-duplicated, and capped at 20.

**Response:** `201 Created` with the created note. `model_version` is `manual`
and `confidence` is `1.0`, which distinguishes human-authored notes from
transcribed ones. A best-effort embedding refresh runs after the save, so the
note is also reachable from semantic search.

### GET `/notes`

List notes with optional filtering.

**Query Parameters:**
- `folder` (optional): Filter by folder path (e.g., `blog-ideas/react`)
- `view` (optional, default: `active`): `active`, `archived`, or `trash`
- `limit` (optional, default: 50): Maximum results
- `offset` (optional, default: 0): Pagination offset

`total` is the true number of matching notes for the user, not the page size.
Archived and trashed notes are excluded from `active`, search, tags, folders,
and dashboard counts.

**Response:** `200 OK`
```json
{
  "notes": [
    {
      "id": "uuid",
      "title": "React Performance Tips",
      "summary": "Notes on optimizing React with useMemo and useCallback.",
      "content": "# React Performance Optimization\n...",
      "folder_path": "blog-ideas/react",
      "filename": "optimize-performance-2025-11-08.md",
      "tags": ["react", "performance", "optimization"],
      "confidence": 0.92,
      "transcription_duration": 3.48,
      "model_version": "gpt-transcribe",
      "word_count": 125,
      "created_at": "2025-11-08T10:30:00Z",
      "updated_at": "2025-11-08T10:30:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0,
  "view": "active"
}
```

### GET `/notes/<note_id>`

Get a specific note by ID.

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "title": "React Performance Tips",
  "summary": "Notes on optimizing React with useMemo and useCallback.",
  "content": "# React Performance Optimization\n...",
  "folder_path": "blog-ideas/react",
  "filename": "optimize-performance-2025-11-08.md",
  "tags": ["react", "performance", "optimization"],
  "confidence": 0.92,
  "transcription_duration": 3.48,
  "model_version": "gpt-transcribe",
  "word_count": 125,
  "source": "audio",
  "language": null,
  "version": 2,
  "pinned_at": null,
  "archived_at": null,
  "deleted_at": null,
  "created_at": "2025-11-08T10:30:00Z",
  "updated_at": "2025-11-08T10:30:00Z"
}
```

**Errors:**
- `404`: Note not found

### PUT `/notes/<note_id>`

Update an existing note.

**Request:** `application/json`
```json
{
  "content": "Updated content (optional)",
  "title": "New Title (optional)",
  "summary": "New summary (optional)",
  "folder_path": "new/folder (optional)",
  "tags": ["tag1", "tag2"] (optional)
}
```

**Response:** `200 OK`
```json
{
  // Updated note object
}
```

**Errors:**
- `400`: No data provided
- `404`: Note not found
- `409`: Note is in Trash (restore it before editing)
- `500`: Update failed

Every successful update snapshots the previous state into `note_revisions` and
increments `version`.

### DELETE `/notes/<note_id>`

Move a note to **Trash**. Audio, embeddings, revisions, and the note row are
kept so it can be restored.

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Note {note_id} moved to trash",
  "deleted": true
}
```

**Errors:**
- `404`: Note not found

### POST `/notes/<note_id>/restore`

Restore a trashed note to the active list.

**Response:** `200 OK` with the restored note.

### DELETE `/notes/<note_id>/permanent`

Permanently delete a **trashed** note: its row, revisions, embeddings, and
(best-effort) audio objects.

**Response:** `200 OK`
```json
{ "success": true, "message": "Note {note_id} permanently deleted" }
```

**Errors:**
- `404`: Note not found
- `409`: Note is not in Trash

### POST `/notes/<note_id>/pin`

Body: `{"pinned": true}` or `{"pinned": false}`. Pinned notes sort first in the
Active list. Returns the updated note.

### POST `/notes/<note_id>/archive`

Body: `{"archived": true}` or `{"archived": false}`. Archived notes disappear
from Active, search, tags, folders, and dashboard counts. Returns the updated
note.

### GET `/notes/<note_id>/revisions`

List saved snapshots, newest first.

```json
{
  "revisions": [
    {
      "id": "uuid",
      "note_id": "uuid",
      "version": 2,
      "title": "Previous title",
      "summary": null,
      "content": "Previous content",
      "folder_path": "inbox",
      "tags": ["ideas"],
      "word_count": 42,
      "edit_source": "user",
      "created_at": "2026-11-10T12:00:00Z"
    }
  ],
  "current_version": 3,
  "limit": 50,
  "offset": 0
}
```

### POST `/notes/<note_id>/revisions/<version>/restore`

Replace the note with a saved snapshot. The current state is snapshotted first,
so a restore is itself undoable. Returns the updated note.

### GET `/notes/<note_id>/transcripts`

List raw ASR transcripts stored for a note. Transcripts are separate from the
note body; the note's legacy metadata columns remain for compatibility.

```json
{
  "transcripts": [
    {
      "id": "uuid",
      "note_id": "uuid",
      "audio_clip_id": "uuid",
      "text": "raw transcript",
      "language": "en",
      "model": "gpt-transcribe",
      "duration_seconds": 12.4,
      "confidence": 0.92,
      "created_at": "2026-11-10T12:00:00Z"
    }
  ]
}
```

---

## Folders

### POST `/folders/<path>/rename`

Rename a folder and its entire subtree. `folder_path` stays in sync for
backward compatibility; `folders` is the rename-capable entity.

**Request Body:**
```json
{ "new_path": "projects" }
```

**Response:** `200 OK`
```json
{
  "success": true,
  "old_path": "work",
  "new_path": "projects",
  "renamed_notes": 2
}
```

**Errors:** `400` cannot move into itself, `404` folder not found,
`409` target already exists.

### GET `/folders`

Get the complete folder hierarchy tree.

**Response:** `200 OK`
```json
{
  "folders": {
    "name": "",
    "path": "",
    "note_count": 0,
    "subfolders": [
      {
        "name": "blog-ideas",
        "path": "blog-ideas",
        "note_count": 0,
        "subfolders": [
          {
            "name": "react",
            "path": "blog-ideas/react",
            "note_count": 2,
            "subfolders": []
          }
        ]
      },
      {
        "name": "grocery",
        "path": "grocery",
        "note_count": 1,
        "subfolders": []
      }
    ]
  }
}
```

### GET `/folders/<path:folder_path>/stats`

Get statistics for a specific folder.

**Response:** `200 OK`
```json
{
  "note_count": 2,
  "total_duration": 6.5,
  "avg_confidence": 0.91,
  "top_tags": ["react", "performance", "optimization"]
}
```

---

## Tags

### GET `/tags`

Get all unique tags across all notes.

**Response:** `200 OK`
```json
{
  "tags": [
    "react",
    "performance",
    "optimization",
    "blog",
    "grocery",
    "meeting"
  ]
}
```

### GET `/tags/<tag>/notes`

Get all notes with a specific tag.

**Response:** `200 OK`
```json
{
  "tag": "react",
  "notes": [
    {
      // Note object
    }
  ]
}
```

---

## Search

### GET `/search`

Full-text search across all notes (uses SQLite FTS5).

**Query Parameters:**
- `q` (required): Search query

**Response:** `200 OK`
```json
{
  "query": "React optimization",
  "results": [
    {
      "id": "uuid",
      "title": "React Performance Tips",
      "summary": "Notes on optimizing React with useMemo and useCallback.",
      "content": "# React Performance Optimization\n...",
      "folder_path": "blog-ideas/react",
      "snippet": "# <mark>React</mark> Performance <mark>Optimization</mark>\n...",
      "rank": 1.24,
      "tags": ["react", "performance", "optimization"],
      "created_at": "2025-11-08T10:30:00Z"
    }
  ]
}
```

**Errors:**
- `400`: Query parameter 'q' is required

---

## Ask Notes (AI)

### POST `/ask`

Ask a natural-language question about your notes. The backend uses AI to create a structured query plan (time range/tags/folders), then performs hybrid retrieval (filters + full-text search + embeddings) before generating a markdown answer with sources.

**Request:** `application/json`

```json
{
  "query": "Tell me what I've been eating in February",
  "max_results": 12,
  "debug": false
}
```

**Response:** `200 OK`

```json
{
  "answer_markdown": "…markdown answer…",
  "query_plan": {
    "intent": "summary",
    "time_range": { "start_date": "2025-02-01", "end_date": "2025-02-28", "timezone": null, "is_confident": true },
    "include_tags": ["food"],
    "exclude_tags": [],
    "folder_paths": null,
    "keywords": ["eating", "food"],
    "semantic_query": "what did I eat in February",
    "result_limit": 12
  },
  "sources": [
    { "note_id": "uuid", "title": "Food log", "updated_at": "2025-12-12T23:22:14.716526", "tags": ["food"], "snippet": "…", "score": 0.83 }
  ],
  "warnings": [],
  "followups": ["What did I eat most often?", "Show a timeline of meals in February"]
}
```

**Errors:**
- `400`: Body field `query` is required
- `401`: Missing/invalid authentication token
- `500`: Server-side error (often model access/quota or provider errors)

---

## Administration

All `/admin/*` endpoints require a Clerk user id listed in `ADMIN_USER_IDS`.
Email addresses are not an authorization boundary. Non-admins receive `403`.

### GET `/admin/ops/summary`

One-screen operational snapshot: database health, 1h/24h error counts, top
error fingerprints, email-outbox state, worker heartbeat age, open problem
reports, and whether admin email is configured.

### GET `/admin/reports`

List persisted problem reports. Query: `status` (`new|triaged|resolved|ignored`),
`limit`, `offset`.

### POST `/admin/reports/<report_id>/status`

Body `{"status": "triaged"}`. Moves a report through triage.

### GET `/admin/ops/events`

Recent server-error and degraded-dependency events. `GET /admin/ops/events/<id>`
returns one event including the traceback.

### POST `/admin/test-alert`

Queues a test email through the same outbox/SES path. Returns
`{"queued": bool, "email_configured": bool, "recipients": int}`.

### POST `/admin/outbox/retry`

Requeues failed emails and reclaims rows stranded in `sending` by a crashed
worker. Body is optional: `{"limit": 100, "include_stuck": true}`. Returns
`{"requeued": int, "reclaimed": int}`.

---

## Utility

### GET `/health`

Cheap liveness check.

**Response:** `200 OK`
```json
{
  "status": "ok"
}
```

### GET `/health/ready`

Readiness check for an external uptime monitor. Verifies the database, the
email outbox backlog, and (in production-like environments) the email worker
heartbeat.

**Response:** `200 OK` when healthy, `503 Service Unavailable` when degraded.
```json
{
  "status": "ok",
  "environment": "production",
  "release": "abc1234",
  "components": {
    "database": { "status": "ok" },
    "outbox": { "status": "ok", "oldest_pending_age_seconds": null, "counts": {} },
    "worker": { "status": "ok", "heartbeat_age_seconds": 4 }
  }
}
```

---

## Error Responses

All endpoints follow a consistent error format:

```json
{
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `400`: Bad Request (missing parameters, invalid input)
- `404`: Not Found (resource doesn't exist)
- `500`: Internal Server Error (server-side error)

---

## Testing

Use the provided test script:

```bash
cd backend
./test_api.sh
```

Or test individual endpoints with `curl`:

```bash
# Health check
curl http://localhost:5001/api/health

# List notes
curl http://localhost:5001/api/notes

# Search
curl "http://localhost:5001/api/search?q=react"

# Get folders
curl http://localhost:5001/api/folders
```

