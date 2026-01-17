"""
AI Summarizer Service using OpenAI GPT-4o-mini

This module provides an abstraction layer for generating digests from multiple notes.
"""


from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field

from .openai_provider import chat_model, get_openai_client


class DigestResult(BaseModel):
    """Structured output for digest generation"""
    summary: str = Field(
        description="A comprehensive, engaging summary of the provided notes using markdown formatting."
    )
    key_themes: list[str] = Field(
        description="List of 3-5 key themes identified across the notes."
    )
    action_items: list[str] = Field(
        default_factory=list,
        description="Potential action items or follow-ups extracted from the notes."
    )


class AISummarizerService:
    """
    AI-powered note summarization using OpenAI GPT-4o-mini.
    """
    
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        client: OpenAI | None = None,
    ):
        """
        Initialize the AI summarizer service.
        
        Args:
            api_key: OpenAI API key. If None, reads from OPENAI_API_KEY env var
            model: Model to use (default: gpt-4o-mini)
        """
        self.client = client or (OpenAI(api_key=api_key) if api_key else get_openai_client())
        self.model = model or chat_model()
        
    def summarize(self, notes_content: list[str]) -> DigestResult:
        """
        Generate a summary digest from a list of note contents.
        
        Args:
            notes_content: List of strings, where each string is the content of a note.
        
        Returns:
            DigestResult with summary, themes, and action items.
        """
        if not notes_content:
            return DigestResult(summary="No notes available to summarize.", key_themes=[], action_items=[])
            
        prompt = self._build_prompt(notes_content)
        
        try:
            completion = self.client.beta.chat.completions.parse(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert executive assistant. Synthesize multiple notes into a clear, actionable digest."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                response_format=DigestResult,
                temperature=0.3,
            )
            
            result = completion.choices[0].message.parsed
            
            if not result:
                raise ValueError("OpenAI returned empty response")
            
            return result
            
        except OpenAIError as e:
            print(f"OpenAI API error: {e}")
            raise
        except Exception as e:
            print(f"Unexpected error during summarization: {e}")
            raise

    def _build_prompt(self, notes_content: list[str]) -> str:
        """
        Build the summarization prompt.
        """
        combined_text = "\n\n---\n\n".join(notes_content)
        
        return f"""Analyze the following {len(notes_content)} notes and create a "Smart Digest".

NOTES CONTENT:
\"\"\"
{combined_text}
\"\"\"

TASK:
1. Write a cohesive narrative summary that connects the dots between these notes. Don't just list them; synthesize the information.
2. Identify 3-5 recurring themes or topics.
3. Extract any potential action items, to-dos, or open questions.

FORMAT:
- Use Markdown for the summary (bolding key terms, using bullet points where appropriate).
- Keep the tone professional but conversational.
- Focus on value and insight.
"""

