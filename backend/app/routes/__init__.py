"""API routes package.

Registers all feature-specific sub-blueprints under a single master blueprint.
"""

from flask import Blueprint

from . import (
    ask,
    dashboard,
    feedback,
    health,
    meals,
    notes,
    reports,
    settings,
    sharing,
    todos,
    transcription,
    usage,
    vinyl,
    webhooks,
)

api = Blueprint("api", __name__)

# Register sub-blueprints (no url_prefix — /api is applied at app level)
for _module in [
    health,
    notes,
    transcription,
    ask,
    todos,
    meals,
    vinyl,
    sharing,
    settings,
    usage,
    feedback,
    dashboard,
    reports,
    webhooks,
]:
    api.register_blueprint(_module.bp)
