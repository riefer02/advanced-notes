"""
Query planning for natural-language "Ask your notes" requests.

Converts a free-form user question into a structured QueryPlan:
- date range
- tags/folders constraints
- keyword query (FTS)
- semantic query (embeddings)

Uses OpenAI structured outputs (Pydantic) for reliable JSON.
"""

from __future__ import annotations

from datetime import date
from enum import Enum

from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field

from .openai_provider import chat_model, get_openai_client


class AskIntent(str, Enum):
    fact_lookup = "fact_lookup"
    summary = "summary"
    trend = "trend"
    list = "list"
    timeline = "timeline"


class TimeRange(BaseModel):
    start_date: str | None = Field(
        default=None,
        description="Inclusive start date in ISO format YYYY-MM-DD.",
    )
    end_date: str | None = Field(
        default=None,
        description="Inclusive end date in ISO format YYYY-MM-DD.",
    )
    timezone: str | None = Field(
        default=None,
        description="IANA timezone if known (e.g., 'America/Chicago').",
    )
    is_confident: bool = Field(
        default=False,
        description="True only if the time range is clearly determined from the question.",
    )


class QueryPlan(BaseModel):
    intent: AskIntent = Field(description="The dominant intent of the user's question.")
    time_range: TimeRange | None = Field(
        default=None, description="Time filter derived from the question, if any."
    )
    include_tags: list[str] = Field(
        default_factory=list,
        description="Tags to include (OR semantics unless otherwise specified).",
    )
    exclude_tags: list[str] = Field(
        default_factory=list,
        description="Tags to exclude.",
    )
    folder_paths: list[str] | None = Field(
        default=None,
        description="Folders to include. null means all folders.",
    )
    keywords: list[str] = Field(
        default_factory=list,
        description="Keywords/phrases for full-text search (FTS).",
    )
    semantic_query: str = Field(
        description="A standalone query string suitable for semantic search embeddings.",
        min_length=1,
    )
    result_limit: int = Field(
        default=12, ge=1, le=50, description="Requested maximum number of notes to retrieve."
    )


class QueryPlanner:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        client: OpenAI | None = None,
    ):
        self.client = client or (OpenAI(api_key=api_key) if api_key else get_openai_client())
        self.model = model or chat_model()

    def plan(
        self,
        question: str,
        known_tags: list[str],
        known_folders: list[str],
        today: date | None = None,
        result_limit: int = 12,
    ) -> QueryPlan:
        if not question or not question.strip():
            raise ValueError("Question cannot be empty")

        prompt = self._build_prompt(
            question=question,
            known_tags=known_tags,
            known_folders=known_folders,
            today=today or date.today(),
            result_limit=result_limit,
        )

        try:
            completion = self.client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert search query planner for a personal notes app. "
                            "Your job is to translate the user's question into a structured plan "
                            "for filtering and retrieving relevant notes."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                response_format=QueryPlan,
                temperature=0.2,
            )

            plan = completion.choices[0].message.parsed
            if not plan:
                raise ValueError("OpenAI returned empty query plan")

            # Enforce server-side limit override (UI may clamp too)
            plan.result_limit = max(1, min(int(result_limit), 50))
            return plan
        except OpenAIError as e:
            print(f"OpenAI API error during query planning: {e}")
            raise

    def _build_prompt(
        self,
        question: str,
        known_tags: list[str],
        known_folders: list[str],
        today: date,
        result_limit: int,
    ) -> str:
        tags_str = ", ".join(sorted(set(known_tags))) if known_tags else "(none)"
        folders_str = "\n".join(f"- {p}" for p in sorted(set(known_folders))) if known_folders else "- (none)"

        return f"""You will be given a user's question. Produce a QueryPlan JSON object.

CONTEXT:
- Today is: {today.isoformat()}
- Notes have: title, content, tags (kebab-case), folder_path, created_at, updated_at.
- Tags are the primary organization method.

KNOWN TAGS (use these when they match; otherwise propose reasonable new tags):
{tags_str}

KNOWN FOLDERS (use these when appropriate; otherwise set folder_paths=null):
{folders_str}

RULES:
1) If the user mentions a specific month/year (e.g. \"February\"), interpret it as the most recent occurrence of that month relative to today unless the user specifies a year.\n
2) Always set semantic_query to a concise, standalone query capturing the user's intent.\n
3) Prefer include_tags only when clearly implied; avoid guessing too many tags.\n
4) If you cannot confidently infer a time range, omit it (time_range=null).\n
5) keywords should be short phrases suitable for full-text search.\n
6) result_limit should be {result_limit}.

USER QUESTION:
\"\"\"{question}\"\"\"
"""


