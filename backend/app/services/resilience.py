"""Shared resilience helpers for external dependencies.

Timeouts belong on the client (OpenAI SDK, boto3, requests, DB pool). These
helpers cover the rest: exponential backoff with jitter for plain clients,
best-effort fallbacks, and a single user-facing error type that routes map to
HTTP 503.
"""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Callable
from typing import TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

DEFAULT_ATTEMPTS = 3
DEFAULT_BASE_DELAY_SECONDS = 0.25
DEFAULT_MAX_DELAY_SECONDS = 2.0


class ExternalServiceError(Exception):
    """An external dependency failed and the feature cannot continue."""

    def __init__(self, service: str, message: str | None = None):
        self.service = service
        self.message = message or (
            f"{service} is temporarily unavailable. Please try again in a moment."
        )
        super().__init__(self.message)


def retry_with_backoff(
    fn: Callable[[], T],
    *,
    service: str,
    attempts: int = DEFAULT_ATTEMPTS,
    base_delay: float = DEFAULT_BASE_DELAY_SECONDS,
    max_delay: float = DEFAULT_MAX_DELAY_SECONDS,
) -> T:
    """Run ``fn`` with exponential backoff and full jitter.

    Use for plain HTTP clients (e.g. JWKS). The OpenAI SDK and boto3 already
    implement their own retry/backoff, configured at client construction.
    """
    last_error: BaseException | None = None

    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - retried and re-raised below
            last_error = exc
            if attempt == attempts:
                break

            delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
            delay *= random.uniform(0.5, 1.0)
            logger.warning(
                "%s failed (attempt %d/%d): %s; retrying in %.2fs",
                service,
                attempt,
                attempts,
                exc,
                delay,
            )
            time.sleep(delay)

    raise ExternalServiceError(service) from last_error


def with_fallback(
    fn: Callable[[], T],
    *,
    fallback: T | Callable[[], T],
    service: str,
) -> T:
    """Run ``fn``; on failure log and return a fallback value.

    Use for best-effort work (categorization, embeddings, suggested todos)
    where degraded output is better than failing the whole request.
    """
    try:
        return fn()
    except Exception:  # noqa: BLE001 - the fallback is the contract
        logger.exception("%s failed; continuing with fallback", service)
        return fallback() if callable(fallback) else fallback


def require_external(fn: Callable[[], T], *, service: str) -> T:
    """Run ``fn`` and convert any failure into ``ExternalServiceError``.

    Routes map that to HTTP 503 so an upstream outage is not reported as an
    internal server error.
    """
    try:
        return fn()
    except ExternalServiceError:
        raise
    except Exception as exc:  # noqa: BLE001 - translated for the caller
        logger.exception("%s failed; returning 503", service)
        raise ExternalServiceError(service) from exc
