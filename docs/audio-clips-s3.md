## Audio clips (S3) — upload + playback flow

Advanced Notes stores **audio bytes in S3** and keeps only **metadata in Postgres/SQLite**.

### Recommendation: single bucket, env-prefixed keys

Use **one bucket** and isolate objects by environment using an object key prefix.

By default the backend prefixes keys with **`APP_ENV`** (or `ENV`) and falls back to **`FLASK_ENV`**
(e.g. `development/...` vs `production/...`).

If you want a custom prefix, set **`S3_KEY_PREFIX`** (optional).

Prefix values are normalized to keep keys tidy:

- `production` / `prod` / `live` → `prod`
- `development` / `dev` / `local` → `dev`
- `staging` / `stage` → `staging`

### Required environment variables (backend)

- **S3_BUCKET**: S3 bucket name (e.g. `advanced-notes-audio`)
- **AWS_REGION**: AWS region (e.g. `us-east-1`)
- **AWS_ACCESS_KEY_ID** / **AWS_SECRET_ACCESS_KEY**: IAM credentials with access to the bucket

Optional:

- **S3_ENDPOINT_URL**: for S3-compatible providers (MinIO/R2) later
- **APP_ENV** (or **ENV**): generic environment name used for key prefixing (falls back to `FLASK_ENV`)
- **S3_KEY_PREFIX**: optional override for the object key prefix (overrides APP_ENV/ENV/FLASK_ENV)
- **S3_PRESIGN_PUT_EXPIRES_SECONDS**: default `900`
- **S3_PRESIGN_GET_EXPIRES_SECONDS**: default `900`

### API sequence (mobile client)

1. **Create upload session**

`POST /api/audio-clips`

Body:

```json
{
  "note_id": "optional-note-id",
  "mime_type": "audio/m4a",
  "bytes": 123456,
  "duration_ms": 42000
}
```

Response includes:

- `clip`: DB metadata row
- `upload.url`: presigned **PUT** URL
- `upload.storage_key`: the S3 key the backend expects

2. **Upload bytes to S3**

Send a raw `PUT` to `upload.url` with header `Content-Type: <mime_type>` and the file bytes as the body.

3. **Finalize**

`POST /api/audio-clips/<clip_id>/complete`

Marks the clip as `ready`.

4. **Playback**

`GET /api/audio-clips/<clip_id>/playback`

Returns `{ url, expires_at }` (presigned **GET**).

### Convenience endpoint

If you associate clips to notes, you can fetch the note’s **primary clip** (most recent ready) via:

`GET /api/notes/<note_id>/audio`
