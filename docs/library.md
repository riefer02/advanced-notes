# Unified Library

The Library is the primary browse surface: one reverse-chronological timeline for notes, meals, vinyl records, and tasks. Domain pages still exist for capture, the meal calendar, and the vinyl grid, but they are no longer primary navigation.

## Information architecture

- **Today** (`/dashboard`) — greeting, capture actions, stats, recent captures, today’s meals, active todos.
- **Library** (`/library`) — timeline, filters, search, capture actions, and manage links.
- **Summaries** — AI digests and Ask history.
- **Todos, Friends, Settings, Feedback** — secondary destinations.
- **Notes, Meals, Vinyl** — hidden domain routes, reachable from Library manage links, quick actions, dashboard actions, and deep links.

The sidebar keeps **Library** active while viewing the hidden domain pages.

## Timeline

- Items are grouped under Today / Yesterday / date.
- Filters: All, Notes, Meals, Vinyl, Tasks; the selected filter is a shareable `?type=` search param.
- Local search covers note title/body/tags/folder, meal transcript/items, artist/album/label/genre, and task text.
- Rows deep-link:
  - note → `/notes?note=<id>`
  - meal → `/meals?date=<meal_date>`
  - vinyl → `/vinyl?record=<id>`
  - task → its source note, or `/todos`
- Show more increases the per-domain feed limit (25 → 50 → …).
- Sources load independently; one failed domain does not block the rest.
- The client defensively sorts and dedupes.

## API

`GET /api/library?limit=25&type=note|meal|vinyl|todo`

Returns `{items: [{kind, id, timestamp, data}], counts, limit, has_more}`. `data` is the existing domain DTO. The route currently runs one indexed query per domain and merges in memory.

See [API reference](./api-reference.md#get-library).

## Scale follow-up

Cursor pagination or a SQL `UNION` across the four shapes is the next step if the in-memory merge starts to hurt. The endpoint is the single place to change; the Library UI only depends on the response shape.
