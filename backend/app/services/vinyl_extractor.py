"""
AI Vinyl Record Extraction Service using OpenAI GPT-4.1-mini

This module provides vinyl record metadata extraction from images of record covers,
labels, and sleeves. Uses structured outputs with Pydantic models for reliable JSON responses.
"""

from __future__ import annotations

from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field

from .openai_provider import get_openai_client

# Use GPT-4.1-mini for vision OCR (cheapest practical option for image analysis)
_VINYL_MODEL = "gpt-4.1-mini"


class ExtractedTrack(BaseModel):
    """A track extracted from a vinyl record image"""
    side: str | None = Field(
        default=None,
        description="Side of the record: A, B, C, D",
    )
    position: int | None = Field(
        default=None,
        ge=1,
        description="Track position on the side",
    )
    title: str = Field(description="Track title")
    duration: str | None = Field(
        default=None,
        description="Duration in M:SS or MM:SS format if visible",
    )


class VinylExtractionResult(BaseModel):
    """Structured output for vinyl record extraction"""
    artist: str = Field(description="Artist or band name")
    album_title: str = Field(description="Album title")
    release_year: int | None = Field(
        default=None,
        description="Release year if visible on the record",
    )
    genre: list[str] = Field(
        default_factory=list,
        description="Music genres (e.g., ['Rock', 'Progressive Rock'])",
    )
    label: str | None = Field(
        default=None,
        description="Record label name (e.g., 'Columbia', 'Atlantic')",
    )
    catalog_number: str | None = Field(
        default=None,
        description="Catalog number if visible",
    )
    format: str | None = Field(
        default=None,
        description="Format: LP, 7\", 10\", 12\", 2xLP, etc.",
    )
    pressing_country: str | None = Field(
        default=None,
        description="Country of pressing if identifiable",
    )
    tracks: list[ExtractedTrack] = Field(
        default_factory=list,
        description="Tracklist extracted from back cover or labels",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Overall confidence score for the extraction (0.0-1.0)",
    )
    reasoning: str = Field(
        description="Brief explanation of the extraction decisions and any uncertainties",
    )


class VinylExtractorService:
    """
    AI-powered vinyl record metadata extraction using OpenAI GPT-4.1-mini vision.

    Analyzes images of vinyl record covers, back covers, center labels, and inner
    sleeves to extract structured metadata including artist, album, tracklist, etc.
    """

    def __init__(
        self,
        client: OpenAI | None = None,
        model: str | None = None,
    ):
        self.client = client or get_openai_client()
        self.model = model or _VINYL_MODEL

    def extract(self, image_urls: list[str]) -> VinylExtractionResult:
        """
        Extract vinyl record metadata from one or more images.

        Args:
            image_urls: List of presigned URLs for the record images
                        (front cover, back cover, label, inner sleeve).

        Returns:
            VinylExtractionResult with artist, album, tracks, and confidence.

        Raises:
            OpenAIError: If API call fails.
            ValueError: If no images provided or response is empty.
        """
        if not image_urls:
            raise ValueError("At least one image URL is required")

        content = self._build_content(image_urls)

        try:
            completion = self.client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert vinyl record cataloger. "
                            "Analyze images of vinyl records and extract structured metadata. "
                            "Be precise with artist names, album titles, and catalog numbers. "
                            "If text is partially obscured or hard to read, note your uncertainty "
                            "in the reasoning field and lower the confidence score."
                        ),
                    },
                    {
                        "role": "user",
                        "content": content,
                    },
                ],
                response_format=VinylExtractionResult,
                temperature=0.2,
            )

            result = completion.choices[0].message.parsed

            if not result:
                raise ValueError("OpenAI returned empty response")

            return result

        except OpenAIError as e:
            print(f"OpenAI API error during vinyl extraction: {e}")
            raise
        except Exception as e:
            print(f"Unexpected error during vinyl extraction: {e}")
            raise

    def _build_content(self, image_urls: list[str]) -> list[dict]:
        """Build the multimodal content array with text prompt and images."""
        content: list[dict] = [
            {
                "type": "text",
                "text": """Analyze these vinyl record images and extract all visible metadata.

TASK:
1. Identify the ARTIST and ALBUM TITLE (required)
2. Extract the RELEASE YEAR if visible anywhere
3. Identify GENRE(S) from any visual clues (stickers, labels, style)
4. Read the RECORD LABEL name from the center label or cover
5. Read the CATALOG NUMBER from the label or spine
6. Determine the FORMAT (LP, 7", 10", 12", 2xLP, etc.)
7. Identify PRESSING COUNTRY if indicated (e.g., "Made in USA", "Pressed in UK")
8. Extract the complete TRACKLIST from back cover or labels, including:
   - Side (A/B/C/D)
   - Track position
   - Track title
   - Duration if visible

GUIDELINES:
- Read text carefully, including curved text on center labels
- Catalog numbers are usually alphanumeric (e.g., "SD 19104", "CBS 32110")
- If multiple pressings are possible, note this in reasoning
- Set confidence high (0.8-1.0) when text is clearly readable
- Set confidence medium (0.5-0.7) when some text is unclear
- Set confidence low (0.2-0.4) when heavily guessing
- Always provide artist and album_title even if confidence is low""",
            },
        ]

        for url in image_urls:
            content.append({
                "type": "image_url",
                "image_url": {"url": url},
            })

        return content
