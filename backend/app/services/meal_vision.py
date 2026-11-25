"""
AI Meal Photo Extraction using OpenAI vision.

Turns a photo of a meal (or a receipt) into a preview the client can drop into
the editable meal composer. The image is sent inline as a data URL and is never
stored; nothing here writes to the database.

Uses structured outputs with Pydantic models for reliable JSON responses, and
follows the same client/timeout conventions as ``vinyl_extractor`` and
``meal_extractor``.
"""

from __future__ import annotations

import os
from datetime import date
from functools import lru_cache

from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field

from .meal_extractor import MealType
from .openai_provider import chat_reasoning_extra_body, get_openai_client

# GPT-4.1-mini is the established vision model in this codebase (vinyl OCR).
# Override with MEAL_VISION_MODEL without touching shared config.
_DEFAULT_MEAL_VISION_MODEL = "gpt-4.1-mini"


class ExtractedMealPhotoItem(BaseModel):
    """A food item identified in a meal or receipt photo."""

    name: str = Field(
        min_length=1,
        description="Name of the food or drink item (e.g., 'scrambled eggs', 'latte')",
    )
    portion: str | None = Field(
        default=None,
        description="Portion or quantity when visible (e.g., '2 slices', '1 bowl')",
    )


class MealPhotoExtractionResult(BaseModel):
    """Structured output for meal photo extraction."""

    meal_type: MealType = Field(
        description="Type of meal: breakfast, lunch, dinner, or snack"
    )
    meal_date: str | None = Field(
        default=None,
        description=(
            "ISO date (YYYY-MM-DD) only when the photo shows one (for example a "
            "receipt date); otherwise null so the caller uses today."
        ),
    )
    meal_time: str | None = Field(
        default=None,
        description="Time in HH:MM format only when the photo shows one",
    )
    items: list[ExtractedMealPhotoItem] = Field(
        default_factory=list,
        description="Distinct food and drink items visible in the photo or receipt",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Overall confidence that the items were identified correctly (0.0-1.0)",
    )
    reasoning: str = Field(
        description="Brief explanation of what was recognized and any uncertainty"
    )


class MealVisionService:
    """OpenAI vision extraction for meal and receipt photos."""

    def __init__(
        self,
        client: OpenAI | None = None,
        model: str | None = None,
    ):
        self.client = client or get_openai_client()
        self.model = (
            model or os.getenv("MEAL_VISION_MODEL") or _DEFAULT_MEAL_VISION_MODEL
        )

    def extract(
        self,
        image_data_url: str,
        current_date: str | None = None,
    ) -> MealPhotoExtractionResult:
        """Extract a structured meal preview from one inline image.

        Args:
            image_data_url: ``data:<mime>;base64,<payload>`` URL for the photo.
            current_date: Today's ISO date, used for meal-type and date context.

        Raises:
            ValueError: If the image or provider response is empty.
            OpenAIError: If the API call fails.
        """
        if not image_data_url:
            raise ValueError("An image is required")

        if current_date is None:
            current_date = date.today().isoformat()

        try:
            completion = self.client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert meal tracking assistant with strong "
                            "vision. Identify the food and drink in a photo of a meal, "
                            "plate, menu, or receipt and return structured data. Never "
                            "invent items that are not visible; lower confidence when "
                            "the photo is unclear."
                        ),
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": self._build_prompt(current_date)},
                            {
                                "type": "image_url",
                                "image_url": {"url": image_data_url},
                            },
                        ],
                    },
                ],
                response_format=MealPhotoExtractionResult,
                temperature=0.2,
                extra_body=chat_reasoning_extra_body(self.model),
            )

            result = completion.choices[0].message.parsed
            if not result:
                raise ValueError("OpenAI returned empty response")

            return result

        except OpenAIError as e:
            print(f"OpenAI API error during meal photo extraction: {e}")
            raise
        except Exception as e:
            print(f"Unexpected error during meal photo extraction: {e}")
            raise

    def _build_prompt(self, current_date: str) -> str:
        return f"""Analyze this photo and extract a structured meal preview.

CURRENT DATE: {current_date}

TASK:
1. Determine the MEAL TYPE (breakfast, lunch, dinner, or snack) from the food,
   setting, and any visible text.
2. Extract the MEAL DATE only if the photo clearly shows one (for example a
   printed receipt date); otherwise return null.
3. Extract the MEAL TIME only if the photo clearly shows one; otherwise null.
4. List each distinct FOOD OR DRINK ITEM. For a receipt, use the purchased line
   items and ignore tax, totals, tips, and store information.
5. Add a PORTION only when it is visible or unambiguous (e.g. "2 slices").
6. Give a confidence score (0.0-1.0) and a brief reasoning note.

GUIDELINES:
- Do not guess brand names or ingredients that are not visible.
- Collapse duplicate receipt lines into one item with a quantity portion.
- Set confidence high (0.8-1.0) for clear plates or readable receipts.
- Set confidence medium (0.5-0.7) when some items are partially hidden.
- Set confidence low (0.2-0.4) when the photo is blurry or ambiguous.
- Always return at least one item when any food or drink is visible.

Return structured JSON matching the MealPhotoExtractionResult schema."""


@lru_cache(maxsize=1)
def get_meal_vision_service() -> MealVisionService:
    """Lazily build the shared vision service (avoids client setup at import)."""
    return MealVisionService()
