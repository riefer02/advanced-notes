"""
AI Meal Extraction Service using OpenAI GPT-4o-mini

This module provides meal data extraction from voice transcriptions.
Uses structured outputs with Pydantic models for reliable JSON responses.
"""

from datetime import date
from enum import Enum

from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field

from .openai_provider import chat_model, get_openai_client


class MealType(str, Enum):
    """Type of meal"""
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


class ExtractedFoodItem(BaseModel):
    """A food item extracted from a meal transcription"""
    name: str = Field(description="Name of the food item (e.g., 'scrambled eggs', 'toast')")
    portion: str | None = Field(
        default=None,
        description="Portion or quantity (e.g., '2 slices', '1 cup', 'large')"
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence that this food item was correctly identified (0.0-1.0)"
    )


class MealExtractionResult(BaseModel):
    """Structured output for meal extraction"""
    meal_type: MealType = Field(
        description="Type of meal: breakfast, lunch, dinner, or snack"
    )
    meal_date: str | None = Field(
        default=None,
        description="ISO date (YYYY-MM-DD) if explicitly mentioned, None to use current date"
    )
    meal_time: str | None = Field(
        default=None,
        description="Time in HH:MM format if explicitly mentioned"
    )
    food_items: list[ExtractedFoodItem] = Field(
        default_factory=list,
        description="List of food items mentioned in the transcription"
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Overall confidence score for the extraction (0.0-1.0)"
    )
    reasoning: str = Field(
        description="Brief explanation of the extraction decisions"
    )


class MealExtractorService:
    """
    AI-powered meal extraction using OpenAI GPT-4o-mini.

    Features:
    - Extracts meal type (breakfast, lunch, dinner, snack)
    - Extracts individual food items with portions
    - Handles relative date references ("yesterday", "this morning")
    - Structured JSON outputs using Pydantic models
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        client: OpenAI | None = None,
    ):
        """
        Initialize the meal extraction service.

        Args:
            api_key: OpenAI API key. If None, reads from OPENAI_API_KEY env var
            model: Model to use (default: gpt-4o-mini for cost/speed balance)
        """
        self.client = client or (OpenAI(api_key=api_key) if api_key else get_openai_client())
        self.model = model or chat_model()

    def extract(
        self,
        transcription: str,
        current_date: str | None = None,
    ) -> MealExtractionResult:
        """
        Extract meal data from a transcription.

        Args:
            transcription: The transcribed text describing the meal
            current_date: Current date in ISO format (YYYY-MM-DD) for relative date resolution

        Returns:
            MealExtractionResult with meal type, date, food items, and confidence

        Raises:
            OpenAIError: If API call fails
            ValueError: If response doesn't match expected schema
        """
        if not transcription or not transcription.strip():
            raise ValueError("Transcription cannot be empty")

        if current_date is None:
            current_date = date.today().isoformat()

        # Build the extraction prompt
        prompt = self._build_prompt(transcription, current_date)

        try:
            # Call OpenAI with structured outputs
            completion = self.client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert meal tracking assistant. Analyze transcriptions and extract structured meal data."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                response_format=MealExtractionResult,
                temperature=0.3,  # Lower temperature for more consistent extraction
            )

            # Extract the parsed response
            result = completion.choices[0].message.parsed

            if not result:
                raise ValueError("OpenAI returned empty response")

            return result

        except OpenAIError as e:
            print(f"OpenAI API error: {e}")
            raise
        except Exception as e:
            print(f"Unexpected error during meal extraction: {e}")
            raise

    def _build_prompt(self, transcription: str, current_date: str) -> str:
        """
        Build the meal extraction prompt.

        Args:
            transcription: The text to extract from
            current_date: Current date for relative date resolution

        Returns:
            Formatted prompt string
        """
        prompt = f"""Analyze this meal transcription and extract structured meal data.

TRANSCRIPTION:
\"\"\"
{transcription}
\"\"\"

CURRENT DATE: {current_date}

TASK:
1. Determine the MEAL TYPE (breakfast, lunch, dinner, or snack)
2. Extract the MEAL DATE if mentioned (resolve relative dates like "yesterday", "this morning")
3. Extract the MEAL TIME if mentioned
4. Extract all FOOD ITEMS with portions/quantities
5. Provide a confidence score (0.0-1.0) for the extraction

MEAL TYPE GUIDELINES:
- Use context clues: "this morning" → breakfast, "at noon" → lunch, "tonight" → dinner
- Time-based hints: before 10am → breakfast, 11am-2pm → lunch, 5pm-9pm → dinner
- If no clear indication, infer from food items (cereal → breakfast, sandwich → lunch)
- Use "snack" for small items between meals or when explicitly mentioned

DATE RESOLUTION:
- "yesterday" → {current_date} minus 1 day
- "today", "this morning", "tonight" → {current_date}
- "last night" → {current_date} minus 1 day
- If no date mentioned → return null (will use current date)

FOOD ITEM EXTRACTION:
- Extract each distinct food item mentioned
- Include portion/quantity when stated: "two eggs" → name: "eggs", portion: "2"
- Include descriptors: "scrambled eggs", "whole wheat toast"
- Set confidence high (0.8-1.0) for explicit items
- Set confidence medium (0.5-0.7) for inferred items

EXAMPLES:
- "For breakfast I had two scrambled eggs and toast with butter"
  → meal_type: breakfast, food_items: [eggs (portion: 2, scrambled), toast, butter]

- "I grabbed a sandwich and chips for lunch"
  → meal_type: lunch, food_items: [sandwich, chips]

- "Yesterday's dinner was pasta with marinara sauce and a salad"
  → meal_type: dinner, meal_date: (yesterday's date), food_items: [pasta, marinara sauce, salad]

Return your analysis as structured JSON matching the MealExtractionResult schema."""

        return prompt
