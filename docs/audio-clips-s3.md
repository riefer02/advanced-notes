# S3 Storage — Patterns & Best Practices

Chisos stores **binary assets (audio, images) in S3** and keeps only **metadata in Postgres/SQLite**. This document covers both current use cases and the patterns to follow when adding new ones.

---

## General Architecture

```
┌─────────┐   multipart    ┌─────────┐   put_object   ┌────┐
│ Browser │  ──────────────>│ Backend │  ────────────>  │ S3 │
└─────────┘                 └─────────┘                 └────┘
                                │                          │
                            DB record                 presigned GET
                          (metadata only)              for viewing
```

**Key principle: the backend always mediates uploads.** The browser sends files to the backend via standard multipart form upload. The backend then uploads to S3 server-side using `put_object`. This avoids S3 CORS configuration and keeps the upload flow simple.

Presigned GET URLs are generated on-demand for viewing/playback and are short-lived (default 15 minutes).

### Why not presigned PUT from the browser?

Presigned PUT URLs (where the browser uploads directly to S3) require CORS configuration on the S3 bucket. This is fragile — different S3-compatible providers (AWS, R2, MinIO) have different CORS mechanisms, and misconfiguration leads to silent upload failures that are hard to debug. Server-side upload through the backend avoids this entirely and simplifies the client code to a single API call.

---

## Shared Configuration

All S3 features share a single bucket and set of credentials:

### Required environment variables

- **S3_BUCKET**: bucket name (e.g. `chisos-assets`)
- **AWS_REGION**: AWS region (e.g. `us-east-1`)
- **AWS_ACCESS_KEY_ID** / **AWS_SECRET_ACCESS_KEY**: IAM credentials

### Optional

- **S3_ENDPOINT_URL**: for S3-compatible providers (MinIO, Cloudflare R2)
- **APP_ENV** (or **ENV**): environment name for key prefixing (falls back to `FLASK_ENV`)
- **S3_KEY_PREFIX**: explicit override for the object key prefix
- **S3_PRESIGN_PUT_EXPIRES_SECONDS**: default `900`
- **S3_PRESIGN_GET_EXPIRES_SECONDS**: default `900`

### Key prefix convention

Use **one bucket** and isolate objects by environment using an object key prefix.

The backend auto-normalizes the prefix from `APP_ENV`/`ENV`/`FLASK_ENV`:

- `production` / `prod` / `live` → `prod`
- `development` / `dev` / `local` → `dev`
- `staging` / `stage` → `staging`

Example keys:
```
dev/audio/user_abc/clip_123.m4a
dev/vinyl/user_abc/img_456.jpg
prod/audio/user_xyz/clip_789.m4a
prod/vinyl/user_xyz/img_012.jpg
```

---

## Feature: Audio Clips

**Service module**: `backend/app/services/s3_audio.py`

Audio clips are **disabled by default**. Enable with `AUDIO_CLIPS_ENABLED=true`. When disabled, audio-related endpoints return `501`.

### Key format

`{prefix}/audio/{user_id}/{clip_id}{ext}`

### Upload flow (presigned PUT — native mobile clients)

Audio clips use the presigned PUT pattern because mobile SDKs can handle direct S3 uploads reliably (no CORS). This is the one case where presigned PUT is acceptable.

1. `POST /api/audio-clips` — create upload session, get presigned PUT URL
2. Client PUTs bytes directly to S3
3. `POST /api/audio-clips/<clip_id>/complete` — verify via `head_object`, mark ready

### Playback

`GET /api/audio-clips/<clip_id>/playback` — returns `{ url, expires_at }` (presigned GET).

### Convenience

`GET /api/notes/<note_id>/audio` — returns the note's primary clip (most recent ready).

### Privacy

Deleting a note cascades to all associated audio clips and best-effort deletes S3 objects.

---

## Feature: Vinyl Record Images

**Service module**: `backend/app/services/s3_vinyl.py` (delegates to `s3_audio` for S3 operations)

Vinyl images are available whenever `S3_BUCKET` is configured (no separate feature flag).

### Key format

`{prefix}/vinyl/{user_id}/{image_id}{ext}`

### Upload flow (server-side — browser clients)

Images are uploaded through the backend to avoid S3 CORS issues:

1. `POST /api/vinyl/<record_id>/images` — multipart form with `file` and `image_type`
2. Backend reads the file, uploads to S3 via `put_object`, creates DB record, marks as ready — all in one call
3. Returns `{ image: VinylImage }` with status `ready`

### Viewing

Cover images are served via presigned GET URLs generated server-side. The `_enrich_vinyl_record()` helper in `routes.py` adds `cover_image_url` to API responses. Presigned URL generation is a local signing operation (no network call to AWS), so it's safe to do for every record in list responses.

### Image types

`front_cover`, `back_cover`, `label`, `inner_sleeve`, `other`

### List view optimization

The `list_vinyl_records` storage method batch-loads cover images (one extra query for all records with a `cover_image_id`) rather than loading all images for all records.

---

## Adding a New S3-Backed Feature

Follow this checklist:

1. **Create a service module** (e.g. `s3_myfeature.py`) that delegates to `s3_audio` for the actual S3 operations:
   ```python
   from app.services import s3_audio

   def s3_available() -> bool:
       return bool(Config.S3_BUCKET)

   def object_key_for_thing(*, user_id, thing_id, mime_type) -> str:
       ext = MIME_TO_EXT.get(mime_type, ".bin")
       prefix = Config.effective_s3_key_prefix()
       return f"{prefix}/myfeature/{user_id}/{thing_id}{ext}"

   def upload_object(*, storage_key, content_type, data):
       s3_audio.put_object_bytes(storage_key=storage_key, content_type=content_type, data=data)

   def presign_get_object(*, storage_key):
       return s3_audio.presign_get_object(storage_key=storage_key)
   ```

2. **Use server-side upload for browser clients.** Accept the file via multipart form, read bytes in the endpoint, call `upload_object`. Return the completed record.

3. **Generate presigned GET URLs at response time**, not at upload time. URLs expire, so generate fresh ones when serving API responses.

4. **Guard endpoints** with `if not s3_myfeature.s3_available(): return api_error(...)`.

5. **Include `user_id` in the object key** for data isolation.

6. **Cascade deletes** — when the parent resource is deleted, best-effort delete S3 objects.

7. **Batch-load for list views** — don't load all child records for every item. Query only what's needed (e.g. just the cover image).
