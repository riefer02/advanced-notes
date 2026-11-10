# Incident Runbook

**Audience:** Andrew (administrator)
**Last updated:** 2026-11-10

The goal is a five-minute answer to: **is this a total outage, a database problem,
an upstream provider problem, or one broken feature?**

---

## 1. First signal

| Signal | Likely meaning | First check |
|---|---|---|
| External uptime monitor fires | Total outage, bad deploy, or DB down | Railway deploy status + `/api/health/ready` |
| Sentry alert (once enabled) | A specific exception is spiking | Sentry issue → release → `/admin` |
| Daily ops digest | Errors, failed emails, or new reports | `/admin` |
| User emails / feedback | Feature-level breakage | `/admin/reports` + `/admin/ops/events` |

If **everything** is down, the app cannot tell you. That is why the external
monitor is mandatory. It must live outside Railway and hit:

```
GET https://<backend-domain>/api/health/ready
```

Expect `200` normally, `503` when degraded. Alert after 2 consecutive failures.

---

## 2. Five-minute triage

1. **Open `/admin`** while signed in as an account listed in `ADMIN_USER_IDS`.
   - Database `ok`?
   - Worker heartbeat age under `OPS_WORKER_STALE_SECONDS` (120s)?
   - Outbox `failed` or oldest pending age?
   - Top errors in the last hour?
2. **Open `/api/health/ready`** directly (no auth) and compare.
3. **Railway:** is the latest deploy healthy? Did `migrate.py` fail?
4. **Sentry** (once enabled): is the error new, or a known fingerprint that just got louder?
5. **Users:** check `/admin/reports` and feedback for a matching description.

Do not start changing code until you can name which component is down.

---

## 3. Scenario playbook

### Total outage / bad deploy
- **Signs:** monitor fails, `/api/health/ready` unreachable, Railway shows a failed deploy.
- **Do:**
  1. If migrations **did not** finish, roll back normally.
  2. If migrations **succeeded** and the app is broken, do **not** use one-click
     rollback: the previous release’s Alembic cannot resolve the new head.
     Override the old start command to skip `python migrate.py`, or deploy a
     code revert that keeps the new migration files.
  3. Check `migrate.py` output: did the advisory lock time out or did a migration fail?
  4. Confirm `/api/health/ready` is `200` after rollback.
  5. Re-deploy the fix only after the previous version is serving.

### Database down or refusing connections
- **Signs:** `/health/ready` → `503`, `components.database.status = "down"`; `/admin` fails to load because it needs the DB.
- **Do:**
  1. Railway Postgres status, connection count, disk.
  2. Check `DATABASE_URL` is still referenced (the app now refuses SQLite in production).
  3. If connection exhaustion: reduce `WEB_CONCURRENCY` or pool size, restart the service.
  4. After recovery, confirm `/health/ready` and `/admin`.
  5. Restore from backup only if data is actually lost (see §4).

### OpenAI / transcription or Ask failing
- **Signs:** users see "temporarily unavailable" (503); `/admin/ops/events` shows `ExternalServiceError` at 503, but no email flood (by design).
- **Do:**
  1. Check https://status.openai.com.
  2. Confirm the API key and model access (`gpt-6-luna`, `gpt-transcribe`).
  3. If it is a provider outage, wait; fallbacks keep keyword search and manual notes working.
  4. If it is a bad key or model retirement, rotate/fix the env var and redeploy.

### Email / admin alerts not arriving
- **Signs:** `components.worker.status = "stale"` or `"missing"`; outbox `failed` > 0; no digest.
- **Do:**
  1. Check SES credentials, `SES_SENDER_EMAIL`, configuration set, and `ADMIN_EMAILS`.
  2. On `/admin`, click **Send test alert**. If `queued: false`, email is not configured.
  3. On `/admin`, click **Retry email outbox** to requeue failed rows and reclaim rows stranded in `sending` after a worker crash.
  4. If SES is down, use the Railway logs and the DB (`problem_reports`, `ops_events`) as the source of truth.
  5. A permanent bounce of the admin address is not self-alerting. Check `email_events` and update the recipient.

### Worker stopped / emails piling up
- **Signs:** heartbeat missing or older than 120s; outbox `pending` grows.
- **Do:**
  1. Restart the web service (the worker is a daemon thread).
  2. Click **Retry email outbox**.
  3. If this repeats, move the worker to a dedicated Railway service (roadmap: Ongoing).

### Migration failure
- **Signs:** deploy fails before the app serves; Railway logs show `❌ Migration failed`.
- **Do:**
  1. Do not retry blindly. Read the Alembic error.
  2. Verify locally: `DATABASE_URL=sqlite:///... alembic upgrade head`.
  3. Check for a lock timeout (60s advisory lock) caused by another replica still migrating.
  4. Roll back the deploy; fix the migration; ship separately.
  5. Destructive migrations require a fresh backup and a tested downgrade.

### Elevated 5xx rate
- **Signs:** `/admin` shows errors rising; top fingerprint names the route.
- **Do:**
  1. Open the event detail (`/admin/ops/events/<id>`) for the traceback.
  2. Reproduce with the same route and user id if available.
  3. If the cause is a client 4xx being misclassified, fix the route (do not page yourself).
  4. If it is a new deploy, roll back first and diagnose after.

---

## 4. Backups (not yet verified)

Until a restore drill passes, **assume there is no backup**.

Planned target:
- Nightly `pg_dump --format=custom` to S3 with 30-day lifecycle.
- Restore into a staging database monthly.
- Record the restore time and row counts in `docs/roadmap.md`.

Never run a destructive migration before this exists.

---

## 5. Recovery checklist

- [ ] `/api/health/ready` returns `200`
- [ ] `/admin` shows database `ok`, worker heartbeat fresh, outbox not backed up
- [ ] A real note can be created (manual) and a recording transcribed
- [ ] A manual note appears in search
- [ ] Admin test alert is received
- [ ] No new top error fingerprint in the last 15 minutes
- [ ] Incident + fix noted in the PR or roadmap changelog

---

## 6. Useful commands

```bash
# Is the API alive and ready?
curl -s https://<backend-domain>/api/health/ready | jq

# Run migrations locally against a clean DB
cd backend
DB="$(mktemp -d)/c.db"
DATABASE_URL="sqlite:///$DB" uv run alembic upgrade head
DATABASE_URL="sqlite:///$DB" uv run alembic downgrade base

# Full verification before shipping a fix
uv run ruff check app/ tests/
uv run python -m pytest tests/ -q
cd ../frontend && pnpm run lint && pnpm run test:run && pnpm run build
```
