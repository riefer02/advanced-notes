"""Background delivery of queued admin emails.

One daemon thread per process polls the outbox. Rows are claimed atomically,
so running this in every Gunicorn worker does not duplicate sends.
"""

from __future__ import annotations

import logging
import threading
import time

logger = logging.getLogger(__name__)

_FLUSH_INTERVAL_SECONDS = 15


def start_email_worker(app, interval: float = _FLUSH_INTERVAL_SECONDS) -> threading.Thread:
    def beat(storage) -> None:  # noqa: ANN001
        try:
            storage.upsert_heartbeat("email-outbox", detail=f"interval={interval}s")
        except Exception:  # noqa: BLE001 - heartbeat is advisory
            logger.debug("Failed to record email worker heartbeat", exc_info=True)

    def loop() -> None:
        with app.app_context():
            beat(app.extensions["services"].storage)
        while True:
            try:
                with app.app_context():
                    svc = app.extensions["services"]
                    beat(svc.storage)
                    svc.email.maybe_enqueue_daily_digest()
                    svc.email.maybe_enqueue_ops_digest()
                    svc.email.flush()
            except Exception:  # noqa: BLE001 - the loop must survive
                logger.exception("Email outbox flush failed")
            time.sleep(interval)

    thread = threading.Thread(target=loop, name="email-outbox", daemon=True)
    thread.start()
    return thread
