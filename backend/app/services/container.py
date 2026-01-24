"""
Dependency injection container for backend services.

We store a single Services instance on the Flask app (app.extensions["services"]).
Routes can then fetch dependencies via get_services() which makes route tests able
to inject fakes without importing/initializing global singletons.
"""

from __future__ import annotations

from dataclasses import dataclass

from flask import current_app

from .ai_categorizer import AICategorizationService
from .ask_service import AskService
from .email_service import EmailService
from .embeddings import EmbeddingsService
from .meal_extractor import MealExtractorService
from .query_planner import QueryPlanner
from .storage import NoteStorage
from .summarizer import AISummarizerService
from .usage_tracking import UsageTrackingService


@dataclass(frozen=True)
class Services:
    storage: NoteStorage
    embeddings: EmbeddingsService
    planner: QueryPlanner
    asker: AskService
    categorizer: AICategorizationService
    summarizer: AISummarizerService
    meal_extractor: MealExtractorService
    usage_tracking: UsageTrackingService
    email: EmailService


def create_services(*, database_url: str | None = None) -> Services:
    """
    Build the production Services container.

    Args:
        database_url: Optional override for database URL (useful for tests).
    """
    storage = NoteStorage(database_url=database_url) if database_url else NoteStorage()
    return Services(
        storage=storage,
        embeddings=EmbeddingsService(),
        planner=QueryPlanner(),
        asker=AskService(),
        categorizer=AICategorizationService(),
        summarizer=AISummarizerService(),
        meal_extractor=MealExtractorService(),
        usage_tracking=UsageTrackingService(),
        email=EmailService(),
    )


def get_services() -> Services:
    """
    Fetch the Services container from the current Flask app.

    Raises:
        RuntimeError if services have not been attached to the app.
    """
    services = current_app.extensions.get("services")
    if services is None:
        raise RuntimeError('Services not configured. Expected app.extensions["services"].')
    return services


