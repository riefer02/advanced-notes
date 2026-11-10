# Chisos Improvement Roadmap

**Last updated:** 2026-11-10
**Owner:** Andrew (administrator)
**Working agreement:** one shippable slice per PR, verified against the checklist at the bottom. Dates are estimates, not promises. Anything not marked **Done** is not done, no matter how small.

---

## Product thesis

Chisos should be the best place to **capture a thought in under five seconds and find it again with confidence**. The moat is not "another markdown editor" — it is **audio-first personal memory across life domains** (notes, todos, meals, records, friends) with answers that cite the exact source and can play it back.

Three rules for every feature:

1. **Capture must never require a decision.** Folder, title, and tags are optional.
2. **Nothing the user wrote may be lost.** Revisions, soft delete, drafts, and durable reports come before new AI features.
3. **Trust is a feature.** If it breaks, the administrator hears about it before users do.

---

## Status at a glance

| Area | State | Honest read |
|---|---|---|
| Audio capture + transcription | ✅ Done | Strong, bounded, retryable |
| Manual typed notes | ✅ Done (2026-11-10) | `POST /api/notes`, Write tab, drafts, upload, retry |
| Admin communication | ✅ Core done (2026-11-10) | Durable reports, ops events, readiness, daily digest, `/admin` |
| Migration reproducibility | ✅ Done (2026-11-10) | Clean SQLite up/down in CI |
| Production DB safety | ✅ Done (2026-11-10) | Refuses SQLite in production |
| Note history / undo | ✅ Done (2026-11-10) | Per-edit snapshots + restore |
| Soft delete / archive / pin | ✅ Done (2026-11-10) | Trash, Archived, Pin; automatic retention purge still pending |
| Search at scale | ✅ Done (2026-11-10) | Postgres GIN, SQLite sanitized FTS, HNSW, transcripts |
| Tags/folders model | ✅ Done (2026-11-10) | Normalized tags + folder entities with rename |
| Backups + restore drill | ❌ Not started | Unverified; treat as no backup |
| External uptime + Sentry | ❌ Not started | Out-of-band alerting still missing |
| Mobile/quick capture everywhere | ❌ Not started | Web only |
| Export / data portability | ❌ Not started | Lock-in risk |

---

## Phase plan

### Phase 0 — Reliability foundations · **Done 2026-11-10**
- [x] Clean `alembic upgrade head` and `downgrade base` on SQLite
- [x] CI step proving clean SQLite migrations
- [x] Refuse SQLite in `production`/`prod`/`staging` without `ALLOW_SQLITE=true`
- [x] Persist problem reports before notifying (`problem_reports`)
- [x] Bound OpenAI retries to fit the Gunicorn timeout; raise worker timeout; access logs
- [x] Advisory lock around migrations so replicas cannot race
- [x] 401 → Clerk sign-out instead of a stuck UI
- [x] Correct notes cache invalidation
- [x] Real note totals + folder counts

### Phase 1 — Manual capture · **Done 2026-11-10**
- [x] `POST /api/notes` (typed note, no audio/AI required)
- [x] Write tab with drafts, folder autocomplete, tags, `⌘/Ctrl+Enter`
- [x] Upload audio file (previously recording only)
- [x] Retain failed recording + retry/download
- [x] Open the created note automatically; `/notes?compose=1` and `?note=<id>`
- [x] Entry points: header, dashboard, command palette

### Phase 2 — Admin communication · **Core done 2026-11-10**
- [x] `ops_events` (queryable server-error + 503 record)
- [x] `service_heartbeats` + email-worker heartbeat
- [x] `GET /api/health/ready` (DB, outbox lag, worker heartbeat)
- [x] Admin auth by Clerk id (`ADMIN_USER_IDS`)
- [x] `/api/admin/ops/summary`, `/admin/reports`, `/admin/ops/events`, `/admin/test-alert`
- [x] Daily ops digest (only when something happened)
- [x] Dedupe error emails by route template, not raw path
- [x] Persist 503/degraded-dependency events without email storms
- [ ] **Sentry** (or equivalent) with release tagging — *Week 1*
- [ ] External uptime monitor hitting `/api/health/ready` — *Week 1, config not code*
- [ ] Secondary alert webhook (Slack/Discord) for P0 events — *Week 2*
- [ ] Bounce suppression list + admin-address bounce alert — *Week 2*
- [ ] Railway deploy-failure notifications enabled + documented — *Week 1*

### Phase 3 — Data safety · **Done 2026-11-10**
- [x] `notes.source` (`audio|manual|import`) and `notes.language`
- [x] `note_revisions` snapshot-on-update (title, content, summary, folder, tags, editor)
- [x] Restore a revision (`POST /api/notes/<id>/revisions/<version>/restore`)
- [x] History UI in `NoteDetail`
- [x] Soft delete (`deleted_at`) filtered from every read path; Trash view + restore
- [x] Archive + pin (`archived_at`, `pinned_at`) and Active/Archived/Trash filters
- [x] Permanent delete from Trash (audio + vectors + revisions) with confirmation
- [x] Tests: revision created on update, restore round-trip, soft-deleted note invisible everywhere, purge works
- [ ] Autosave + unsaved-change guard in `NoteDetail`
- [ ] Automatic purge after a retention window (daily job)

**Exit criteria:** an accidental edit or delete is recoverable from the UI without database access. ✅

### Phase 4 — Search and schema correctness · **In progress (started 2026-11-10)**
- [x] Postgres generated `search_vector` + GIN + `websearch_to_tsquery`
- [x] SQLite FTS query sanitization (no more 500 on quotes/operators)
- [x] Stop hardcoding `'english'` (`simple` default; per-language config is a follow-up)
- [x] Normalize tags (`tags`, `note_tags`) with backfill + dual-write
- [x] Folders as entities (`folders`, `notes.folder_id`) with subtree rename
- [x] `transcripts` table + raw ASR storage (legacy note columns retained)
- [x] Embeddings: model-level unique constraint, race-safe upsert, `content_hash` reuse, HNSW index
- [x] `usage_counters` with backfill and O(1) quota checks
- [x] Friendship unordered-pair uniqueness; `resource_shares.resource_id`
- [ ] Fix `meal_embeddings` / `vinyl_embeddings` `text → vector` drift
- [ ] Remove duplicate indexes; add missing FKs
- [x] Tests + migration up/down on SQLite **and** Postgres (pg18 + pgvector container)

**Exit criteria:** tag click and folder rename are index-backed; a 10k-note account searches in under 200 ms locally.

### Phase 5 — Capture and navigation UX · **Week 3 (Nov 24–28)**
- [ ] Quick-capture hotkey (`n` / `⌘⇧N`) from anywhere
- [ ] Mobile share target / email-in / file import
- [ ] Inbox + weekly triage (AI suggests, human confirms, undo)
- [ ] Notes list: pagination or infinite scroll, j/k navigation, multi-select bulk actions
- [ ] SlideOver focus trap + restore + `aria-labelledby`
- [ ] Replace `confirm()`/`alert()` with toasts + inline confirmation
- [ ] Offline banner from `navigator.onLine`; don't show infinite skeletons
- [ ] `vite:preloadError` reload for post-deploy tabs
- [ ] Move notes state into search params (`?note=&tag=&q=&compose=1`)
- [ ] Remove dead design-system components or adopt them; unify page shell
- [ ] Dark mode either supported end-to-end or the `.dark` block deleted

**Exit criteria:** a keyboard-only user can capture, find, edit, and file a note; a phone user can capture and open the result in one tap.

### Phase 6 — Trust, privacy, portability · **Week 4 (Dec 1–5)**
- [ ] One-click Markdown + JSON export (notes, transcripts, tags, todos, meals, vinyl)
- [ ] Audio retention controls (keep audio / transcript only / auto-purge N days)
- [ ] Consent-first recording UX (disclosure + spoken consent line + consent log)
- [ ] Account deletion request path that purges notes, audio, embeddings, shares
- [ ] Subprocessor + privacy page in docs
- [ ] Optional BYOK AI key per user
- [ ] Per-note "never send to AI" toggle

**Exit criteria:** a user can leave with all their data and know exactly what was stored.

### Phase 7 — Differentiators · **Weeks 5–6 (Dec 8–19)**
- [ ] Timestamped citations + audio deep links in Ask answers
- [ ] Hybrid retrieval (BM25 + vectors + RRF) with reranker
- [ ] Speaker-labeled transcripts (with realistic expectations) + action items → todos
- [ ] Typed-object queries across todos/meals/vinyl
- [ ] Useful daily note / home surface
- [ ] Backlinks / auto-linked entities (people, records, meals)
- [ ] Prompt-injection defenses for ingested content (fencing, provenance tags)
- [ ] AI eval set + faithfulness/context-precision tracking

**Exit criteria:** an answer can be verified in one click, and "what did I cook with chicken last month?" works across domains.

### Ongoing — Scale and operations
- [ ] Nightly `pg_dump` to S3 + documented restore drill (before any destructive migration)
- [ ] PgBouncer or smaller pools before a second replica; `statement_timeout`
- [ ] Generic `jobs` table; move embeddings/re-categorization off the request path
- [ ] Outbox crash safety: `claimed_at`, reclaim `sending` after 5 minutes, dead-letter UI
  - [x] `claimed_at`, automatic reclaim, and admin "Retry email outbox" (2026-11-10)
  - [ ] Dead-letter alert when `failed > 0`, plus an admin retry history
- [ ] JWKS unknown-`kid` throttle + negative cache
- [ ] `ProxyFix` / correct client IP behind Railway
- [ ] Structured JSON logging + request IDs on every response
- [ ] Retention/pruning for `token_usage`, `ask_history`, `ops_events`, sent emails
- [ ] S3 lifecycle rules + orphan sweeper
- [ ] Idempotency keys for user-facing POSTs
- [ ] Two replicas + zero-downtime deploy + single worker/leader lock

---

## Backlog by audit severity

### P0 (must never regress)
| Item | Status |
|---|---|
| Manual note creation | ✅ Done |
| Notifications durable when email is broken | ✅ Done |
| Production cannot silently use SQLite | ✅ Done |
| Clean migrations | ✅ Done |
| Request timeouts fit worker timeout | ✅ Done |
| Admin learns about errors via durable record + digest | ✅ Done |
| Note edits/deletes recoverable | ✅ Done (2026-11-10) |
| Out-of-band outage alerting (external monitor) | ❌ Week 1 config |
| Sentry-style exception capture | ❌ Week 1 |

### P1
| Item | Status |
|---|---|
| Note revisions / soft delete / archive / pin | ✅ Done (2026-11-10); auto-purge pending |
| Postgres FTS index + sanitized SQLite FTS | ✅ Done (2026-11-10) |
| Tags/folders normalized | ✅ Done (2026-11-10) |
| Embedding uniqueness + ANN + hash reuse | ✅ Done (2026-11-10) |
| Quota counters | ✅ Done (2026-11-10) |
| Outbox reclaim / dead letter | ✅ Reclaim + admin retry (2026-11-10); dead-letter alert pending |
| Backups + restore drill | ❌ Before Phase 4 |
| Migrations single-runner | ✅ Done (advisory lock) |
| Structured logging + request IDs | ❌ Ongoing |
| Lazy OpenAI clients (don't block boot) | ❌ Ongoing |
| JWKS throttle | ❌ Ongoing |

### P2
| Item | Status |
|---|---|
| Pagination / virtualization | ❌ Phase 5 |
| Focus management / keyboard rows | ❌ Phase 5 |
| Toasts instead of native dialogs | ❌ Phase 5 |
| Offline handling | ❌ Phase 5 |
| Export | ❌ Phase 6 |
| Design-token cleanup / dark mode | ❌ Phase 5 |
| Nav simplification | ❌ Phase 5 |
| Retention/pruning | ❌ Ongoing |
| `jobs` table | ❌ Ongoing |
| Transcript entity | ❌ Phase 4 |

---

## How we work through it

**Cadence**
- **Monday:** pick one phase slice; write the acceptance criteria in the PR description.
- **Tuesday–Thursday:** implement, test, migrate up/down, docs.
- **Friday:** deploy, watch `/admin` and Sentry for 24h, then mark the slice Done.
- **No mixed PRs.** Reliability and product changes ship separately.

**Definition of done (every slice)**
1. Backend tests pass (`406+` today), coverage stays ≥ 80%.
2. Frontend lint, format, tests, and production build pass.
3. Migration verified `upgrade head` **and** `downgrade` on SQLite; Postgres CI job green.
4. New env vars documented in `.env.example` and `docs/railway-deployment.md`.
5. `/api/health/ready` is 200 after deploy.
6. `/admin` shows no new error spike for 24h.
7. A rollback path exists (previous release or reversible migration).

**Verification commands**
```bash
cd backend && uv run ruff check app/ tests/
cd backend && uv run python -m pytest tests/ -q
cd backend && DB="$(mktemp -d)/c.db" && DATABASE_URL="sqlite:///$DB" uv run alembic upgrade head
cd frontend && pnpm run lint && pnpm run format:check && pnpm run test:run && pnpm run build
```

---

## Decisions already made

| Decision | Rationale |
|---|---|
| Manual notes use `model_version="manual"` and `confidence=1.0` until Phase 3 | Ships provenance now without a schema round-trip; `source` replaces it cleanly. |
| Problem reports commit before email | A broken mail path must not lose the report. |
| Admin auth by Clerk user id, not email | Email is mutable and not an authorization boundary. |
| Ops digest is silent on quiet days | Daily all-clear trains the admin to ignore the channel. |
| Readiness fails on stale worker only in production-like envs | Tests and local dev have no worker. |
| Soft delete, not immediate purge, in Phase 3 | Recovery beats disk savings; a purge job handles retention. |
| External monitor + Sentry are configuration, not a feature | They must live outside the app they monitor. |

---

## Honest risks

1. **Backups are unverified.** Until a restore drill passes, assume there is no backup. This blocks Phase 4's destructive migrations.
2. **Railway single replica.** Deploys are brief outages. Two replicas require moving the worker to a single service or leader lock.
3. **Migration drift is tolerated but not fixed.** `alembic check` remains report-only until the duplicate indexes and vector types are reconciled in Phase 4.
4. **AI cost and model access can change.** Keep fallbacks and per-user caps; never let a retry loop bill silently.
5. **The admin channel is still app-dependent.** `/api/health/ready` only helps if something outside Railway checks it. That is a Week 1 setup task, not code.
6. **Scope pressure is the main risk.** Phases 3–4 are the ones that make the product trustworthy; resist adding AI features before they land.

---

## What "world's greatest" means here

Not the most features. The most **trustworthy capture and recall**:

- Capture works offline, on a phone, with a mic, a keyboard, or a file.
- Nothing is lost: drafts, revisions, soft delete, durable reports.
- Every answer points at the exact note and timestamp it came from.
- The owner knows within minutes when something breaks.
- A user can export everything and leave.

That is the bar. Everything above is sequenced to reach it, with the trust work first.
