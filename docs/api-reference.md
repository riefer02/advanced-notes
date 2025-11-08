# REST API Reference

Complete API documentation for the ASR Mono-repo backend.

**Base URL:** `http://localhost:5001/api`

---

## Transcription

### POST `/transcribe`

Transcribe audio and automatically categorize/save to database.

**Request:**
- **Content-Type:** `multipart/form-data` or `application/octet-stream`
- **Body:** Audio file (WAV, FLAC, OGG, WebM, MP3) or raw audio bytes

**Response:** `200 OK`
```json
{
  "text": "Transcribed text content",
  "meta": {
    "device": "mps",
    "model": "parakeet-tdt-0.6b-v3",
    "sample_rate": 48000,
    "duration": 3.48
  },
  "categorization": {
    "note_id": "uuid",
    "action": "create_subfolder",
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
- `500`: Transcription/categorization error

---

## Notes

### GET `/notes`

List notes with optional filtering.

**Query Parameters:**
- `folder` (optional): Filter by folder path (e.g., `blog-ideas/react`)
- `limit` (optional, default: 50): Maximum results
- `offset` (optional, default: 0): Pagination offset

**Response:** `200 OK`
```json
{
  "notes": [
    {
      "id": "uuid",
      "title": "React Performance Tips",
      "content": "# React Performance Optimization\n...",
      "folder_path": "blog-ideas/react",
      "filename": "optimize-performance-2025-11-08.md",
      "tags": ["react", "performance", "optimization"],
      "confidence": 0.92,
      "transcription_duration": 3.48,
      "model_version": "parakeet-tdt-0.6b-v3",
      "word_count": 125,
      "created_at": "2025-11-08T10:30:00Z",
      "updated_at": "2025-11-08T10:30:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### GET `/notes/<note_id>`

Get a specific note by ID.

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "title": "React Performance Tips",
  "content": "# React Performance Optimization\n...",
  "folder_path": "blog-ideas/react",
  "filename": "optimize-performance-2025-11-08.md",
  "tags": ["react", "performance", "optimization"],
  "confidence": 0.92,
  "transcription_duration": 3.48,
  "model_version": "parakeet-tdt-0.6b-v3",
  "word_count": 125,
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
- `500`: Update failed

### DELETE `/notes/<note_id>`

Delete a note by ID.

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Note {note_id} deleted successfully"
}
```

**Errors:**
- `404`: Note not found

---

## Folders

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

## Utility

### GET `/health`

Health check endpoint.

**Response:** `200 OK`
```json
{
  "status": "ok"
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

