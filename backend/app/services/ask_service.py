"""
Ask service: given a question, a QueryPlan, and retrieved notes, produce an answer.

The answer is a markdown response with citations referencing note IDs.
"""

from __future__ import annotations

from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field

from .openai_provider import chat_model, get_openai_client
from .query_planner import QueryPlan


class AskAnswer(BaseModel):
    answer_markdown: str = Field(
        description="A helpful, well-structured answer in markdown."
    )
    cited_note_ids: list[str] = Field(
        default_factory=list,
        description="List of note IDs that support the answer. Use only IDs from the provided notes.",
    )
    followups: list[str] = Field(
        default_factory=list,
        description="Suggested follow-up questions the user might ask next.",
    )


class RetrievedNote(BaseModel):
    note_id: str
    title: str
    updated_at: str
    tags: list[str]
    snippet: str
    score: float
    content_excerpt: str


class AskService:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        client: OpenAI | None = None,
    ):
        self.client = client or (OpenAI(api_key=api_key) if api_key else get_openai_client())
        self.model = model or chat_model()

    def answer(self, question: str, plan: QueryPlan, notes: list[RetrievedNote]) -> AskAnswer:
        prompt = self._build_prompt(question=question, plan=plan, notes=notes)
        try:
            completion = self.client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a careful personal-notes assistant. "
                            "Answer only from the provided notes, and cite sources by note_id. "
                            "If information is missing, say so explicitly."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                response_format=AskAnswer,
                temperature=0.2,
            )
            result = completion.choices[0].message.parsed
            if not result:
                raise ValueError("OpenAI returned empty answer")
            return result
        except OpenAIError as e:
            print(f"OpenAI API error during ask answer: {e}")
            raise

    def _build_prompt(self, question: str, plan: QueryPlan, notes: list[RetrievedNote]) -> str:
        notes_blocks = []
        for n in notes:
            notes_blocks.append(
                "\n".join(
                    [
                        f"NOTE_ID: {n.note_id}",
                        f"TITLE: {n.title}",
                        f"UPDATED_AT: {n.updated_at}",
                        f"TAGS: {', '.join(n.tags)}",
                        f"SCORE: {n.score:.3f}",
                        "CONTENT_EXCERPT:",
                        n.content_excerpt,
                    ]
                )
            )

        notes_text = "\n\n---\n\n".join(notes_blocks) if notes_blocks else "(no notes)"

        return f"""USER QUESTION:\n\"\"\"{question}\"\"\"\n\nQUERY PLAN (for context):\n{plan.model_dump_json()}\n\nRETRIEVED NOTES:\n\"\"\"\n{notes_text}\n\"\"\"\n\nTASK:\n1) Answer the question using only the retrieved notes.\n2) Write a clear markdown response.\n3) Add a short \"Sources\" section listing the note IDs you used.\n4) If you cannot answer, explain what is missing.\n"""


