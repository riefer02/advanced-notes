"""Background delivery of queued admin emails and light maintenance.

One daemon thread per process polls the outbox. Rows are claimed atomically,
so running this in every Gunicorn worker does not duplicate sends.
"""

from __future__ import annotations

import logging
import random
import threading
import time
from datetime import UTC, datetime

logger = logging.getLogger(__name__)

_FLUSH_INTERVAL_SECONDS = 15
_MAINTENANCE_INTERVAL_SECONDS = 300


def start_email_worker(app, interval: float = _FLUSH_INTERVAL_SECONDS) -> threading.Thread:
    def beat(storage, detail: str) -> None:  # noqa: ANN001
        try:
            storage.upsert_heartbeat("email-outbox", detail=detail)
        except Exception:  # noqa: BLE001 - heartbeat is advisory
            logger.debug("Failed to record email worker heartbeat", exc_info=True)

    state = {"last_maintenance": 0.0, "last_retention": None}

    def maintenance(svc) -> None:  # noqa: ANN001
        now_mono = time.monotonic()
        if now_mono - state["last_maintenance"] >= _MAINTENANCE_INTERVAL_SECONDS:
            state["last_maintenance"] = now_mono
            try:
                from . import s3_audio

                stale = svc.storage.list_all_stale_pending_audio_clips(
                    older_than_minutes=60, limit=50
                )
                by_user: dict[str, list[str]] = {}
                for clip in stale:
                    try:
                        s3_audio.delete_object(storage_key=clip.storage_key)
                    except Exception:  # noqa: BLE001 - best effort
                        logger.warning(
                            "Failed to delete stale audio object %s",
                            clip.storage_key,
                            exc_info=True,
                        )
                    by_user.setdefault(clip.user_id, []).append(clip.id)
                for user_id, clip_ids in by_user.items():
                    svc.storage.delete_audio_clips(user_id, clip_ids)
            except Exception:  # noqa: BLE001 - maintenance must not kill the loop
                logger.exception("Stale audio cleanup failed")

        today = datetime.now(UTC).date()
        if state["last_retention"] != today:
            state["last_retention"] = today
            try:
                pruned = svc.storage.prune_ops_data(older_than_days=30)
                if any(pruned.values()):
                    logger.info("Pruned operational data: %s", pruned)
            except Exception:  # noqa: BLE001
                logger.exception("Operational retention failed")

    def loop() -> None:
        with app.app_context():
            beat(app.extensions["services"].storage, "startup")
        while True:
            try:
                with app.app_context():
                    svc = app.extensions["services"]
                    # Self-heal rows stranded by a previous crash.
                    svc.storage.reclaim_stuck_emails(older_than_minutes=5, limit=50)
                    maintenance(svc)
                    svc.email.maybe_enqueue_daily_digest()
                    svc.email.maybe_enqueue_ops_digest()
                    sent = svc.email.flush()
                    beat(svc.storage, f"interval={interval}s sent={sent}")
            except Exception:  # noqa: BLE001 - the loop must survive
                logger.exception("Email outbox flush failed")
            time.sleep(interval * random.uniform(0.8, 1.2))

    thread = threading.Thread(target=loop, name="email-outbox", daemon=True)
    thread.start()
    return thread
