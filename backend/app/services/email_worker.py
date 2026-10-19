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
    def loop() -> None:
        while True:
            try:
                with app.app_context():
                    email = app.extensions["services"].email
                    email.maybe_enqueue_daily_digest()
                    email.flush()
            except Exception:  # noqa: BLE001 - the loop must survive
                logger.exception("Email outbox flush failed")
            time.sleep(interval)

    thread = threading.Thread(target=loop, name="email-outbox", daemon=True)
    thread.start()
    return thread
