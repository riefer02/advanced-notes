"""Small in-process sliding-window rate limiter.

Good enough for a single-instance app and for protecting a public
"report a problem" endpoint. Limits are per process, so with N workers the
effective allowance is N × limit.
"""

from __future__ import annotations

import threading
import time
from collections import deque


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = max(1, limit)
        self.window_seconds = max(1, window_seconds)
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] > self.window_seconds:
                hits.popleft()

            if len(hits) >= self.limit:
                return False

            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
