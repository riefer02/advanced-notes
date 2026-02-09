# Sharing & Collaboration Architecture

Internal architecture reference for the sharing system.

## Data Model

### Three new tables

```
user_profiles    -- Display name, bio, discoverability
friendships      -- Mutual friend connections (request/accept flow)
resource_shares  -- Per-resource-type sharing grants (vinyl_library, meal_calendar)
```

### Relationship to existing tables

Existing `user_id` columns are unchanged. Sharing is a **permission layer on top** — when user A views user B's vinyl library, the system queries `vinyl_records WHERE user_id = B` after verifying an accepted `resource_shares` row exists.

## Permission Model

### resolve_target_user pattern

Every GET endpoint that supports shared access uses this pattern:

```python
def resolve_target_user(resource_type, min_permission="view", param_name="owner"):
    owner = request.args.get(param_name)
    if not owner:
        return g.user_id  # backward-compatible: own data
    if owner == g.user_id:
        return g.user_id
    # Check accepted share exists
    if not svc.storage.has_access(g.user_id, owner, resource_type, min_permission):
        abort(403)
    return owner
```

### Permission levels

| Level | Vinyl Library | Meal Calendar |
|-------|--------------|---------------|
| `view` | Browse, search, view details | View calendar and meals |
| `edit` | N/A (vinyl is view-only) | Add meals to shared calendar |

### Mutation rules

- **Vinyl**: Only the `user_id` owner can POST/PUT/DELETE records
- **Meals**: Each user can only edit/delete meals where `meal.user_id == g.user_id`
- **Quota**: Always charged to `g.user_id` (the actor), never the resource owner

## Storage Layer

New methods are added to `NoteStorage` rather than modifying existing signatures. This prevents accidental bypass of user isolation.

### Multi-user query methods

```python
# Explicit about querying another user's data
list_vinyl_records_for_user(target_user_id, ...)
get_vinyl_record_for_user(target_user_id, record_id)

# Meal calendar spans multiple users
list_meals_for_users(user_ids: list[str], ...)
get_meals_calendar_for_users(user_ids: list[str], year, month)
```

### has_access check

Single query:
```sql
SELECT 1 FROM resource_shares
WHERE owner_id = :owner AND shared_with_id = :viewer
  AND resource_type = :type AND status = 'accepted'
  AND permission IN (:allowed_permissions)
```

### get_calendar_member_ids

Returns `[owner_id] + [accepted editor user_ids]` for a meal calendar.

## Frontend Architecture

### URL-based context switching

```
/vinyl?owner=user_abc          -- viewing user_abc's vinyl library
/meals?calendar_owner=user_abc -- viewing user_abc's meal calendar
```

No `owner` param = own data (backward-compatible).

### Query key strategy

All query hooks accept optional owner/calendarOwner param:

```typescript
['vinyl', { ...params, owner }]     // owner=undefined means own
['meals', { ...params, calendarOwner }]
```

### SharedContentBanner

When viewing shared content, a banner shows:
- Who owns the content ("Viewing Sarah's vinyl library")
- Link back to own data ("Back to mine")
- Read-only indicator for view-only shares

## User Profiles — Usernames & Avatars

### Username Rules

Usernames follow the pattern `^[a-z0-9][a-z0-9_.]{1,28}[a-z0-9]$`:
- 3–30 characters
- Must start and end with a lowercase letter or digit
- Interior may contain lowercase letters, digits, periods, and underscores
- Stored and compared in lowercase (case-insensitive uniqueness)
- Uniqueness enforced by DB unique constraint on `user_profiles.username`

### Avatar Upload Flow

1. Browser sends multipart form data to `PUT /api/profile/avatar`
2. Backend validates file size (max 1 MB) and MIME type (image/jpeg, image/png, image/webp)
3. Backend uploads to S3 via `s3_avatar.py` → `s3_audio.put_object_bytes()`
4. Storage key `avatars/{user_id}/{uuid}.{ext}` saved to `user_profiles.avatar_storage_key`
5. Presigned GET URL generated at response time (never stored)

### `_enrich_profile()` Pattern

All 14 profile-returning endpoints call `_enrich_profile(profile.model_dump())` which:
- Pops `avatar_storage_key` from the dict (never exposed to clients)
- If S3 is available and key exists, adds `avatar_url` with a presigned GET URL
- Otherwise sets `avatar_url: null`

Applied to: GET/PUT profile, GET other's profile, friend list profiles, search results, share owner/recipient profiles.

### Display Name Derivation

For email-only signups (no Clerk `user_name`):
```python
email.split("@")[0].replace(".", " ").title()
```
Example: `jane.doe@gmail.com` → `Jane Doe`. Falls back to `"User"` when no email is available.

Only fires during auto-creation (first `GET /api/profile`). Existing users keep their current display name.

### Profile API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/profile` | Get own profile (auto-creates if missing) |
| `PUT` | `/api/profile` | Update display name, username, bio, discoverable |
| `GET` | `/api/profile/username-available` | Check username availability |
| `PUT` | `/api/profile/avatar` | Upload/replace avatar (multipart form) |
| `DELETE` | `/api/profile/avatar` | Remove avatar |
| `GET` | `/api/users/<id>/profile` | View friend's profile |

## API Surface Summary

- **3 profile endpoints** (GET own, PUT own, GET other's)
- **8 friend endpoints** (list, requests, sent, request, accept, decline, remove, search)
- **6 share endpoints** (create, list, received, accept, decline, revoke)
- **~10 modified existing endpoints** (vinyl GET routes + meal GET routes accept owner param)

## Status Flows

### Friendship: `pending` → `accepted` | `declined`
- Only addressee can accept/decline
- Either party can delete (unfriend)
- Deleting a friendship also revokes all shares between the pair

### Resource Share: `pending` → `accepted` | `declined` | `revoked`
- Must be friends to create a share
- Only recipient can accept/decline
- Owner can revoke at any time
- Recipient can leave (self-revoke)
- Pending shares do NOT grant access
