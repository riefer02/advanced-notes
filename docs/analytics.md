# Product Analytics

Self-hosted, privacy-friendly analytics. No third-party provider, no IP address, user agent, referrer, session fingerprint, or free-text user content.

## Storage

`analytics_events`:

| Column | Notes |
| --- | --- |
| `id` | UUID |
| `user_id` | Clerk user id |
| `name` | lowercase snake_case/dot-separated, ≤64 chars |
| `properties_json` | small JSON bag (IDs, enums, booleans, counts), ≤2KB / 20 keys |
| `created_at` | server timestamp |

Indexed by `(user_id, created_at)` and `(name, created_at)`.

## Ingestion

`POST /api/analytics/events` (authenticated):

```json
{ "events": [{ "name": "search_opened", "properties": { "kind": "note" } }] }
```

1–50 events per batch; returns `202 {"accepted": N}`. Validation rejects non-object properties, oversized payloads, and invalid names.

## Frontend

`frontend/src/lib/analytics.ts` batches events in memory (2s debounce, 20 per request) and never throws into the UI. Offline events are dropped rather than replayed later.

Instrumented events:

- `dashboard_viewed`
- `search_opened`, `search_result_opened` (`kind`)
- `ask_submitted` (`status`)
- `summary_generated` (`status`)
- `feedback_submitted` (`type`, `rating_present`)
- `data_export_started` (`format`)
- `account_deletion_started`

Do not add note/meal text, names, emails, or other PII to properties.

## Admin summary

`GET /api/admin/analytics/summary?days=30` (admin only): total events, distinct users, totals by event name, and daily counts. No per-user or property drill-down.

## Privacy

- Events are user-scoped and purged by account deletion.
- No IP/user-agent capture.
- The table is not a shadow copy of content; keep properties to IDs/enums/counts.

## Follow-ups

- Retention/cleanup job (the table grows indefinitely).
- `/admin` analytics surface.
- A frontend unit test for batching.
- The final <2s batch can be lost on tab close (`sendBeacon` cannot set auth headers); acceptable for product metrics.
