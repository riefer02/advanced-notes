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
    settings,
    sharing,
    todos,
    transcription,
    usage,
    vinyl,
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
]:
    api.register_blueprint(_module.bp)
