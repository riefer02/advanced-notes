"""
Embeddings utilities for semantic search over notes.

- Uses OpenAI embeddings to generate vectors.
- Stores vectors in DB (SQLite: JSON/text; Postgres: pgvector).
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Iterable, List, Optional

from openai import OpenAI, OpenAIError

from .openai_provider import embedding_model, get_openai_client

def build_note_embedding_text(title: str, content: str, tags: List[str]) -> str:
    tags_part = ", ".join(tags or [])
    return f"Title: {title}\nTags: {tags_part}\n\nContent:\n{content}"


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def normalize_similarity(sim: float) -> float:
    # cosine similarity in [-1, 1] -> [0, 1]
    return max(0.0, min((sim + 1.0) / 2.0, 1.0))


def vector_to_pg_literal(vec: List[float]) -> str:
    # pgvector accepts '[1,2,3]' style literals
    return "[" + ",".join(f"{v:.8f}" for v in vec) + "]"


def vector_to_json(vec: List[float]) -> str:
    return json.dumps(vec)


def vector_from_json(value: str) -> List[float]:
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [float(x) for x in parsed]
        return []
    except Exception:
        return []


class EmbeddingsService:
    """
    Service for generating and managing text embeddings using OpenAI.

    Provides methods for embedding text content and upserting note embeddings
    for semantic search capabilities.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        client: Optional[OpenAI] = None,
    ):
        """
        Initialize the embeddings service.

        Args:
            api_key: OpenAI API key. If None, reads from OPENAI_API_KEY env var.
            model: Embedding model to use (default: text-embedding-3-small).
            client: Optional pre-configured OpenAI client.
        """
        self.client = client or (OpenAI(api_key=api_key) if api_key else get_openai_client())
        self.model = model or embedding_model()

    def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding vector for the given text.

        Args:
            text: The text to embed.

        Returns:
            List of floats representing the embedding vector.

        Raises:
            OpenAIError: If the API call fails.
        """
        if not text or not text.strip():
            return []
        try:
            resp = self.client.embeddings.create(model=self.model, input=text)
            return list(resp.data[0].embedding)
        except OpenAIError as e:
            print(f"OpenAI API error during embeddings: {e}")
            raise

    def embed_query(self, question: str) -> List[float]:
        """
        Generate embedding vector for a search query.

        Args:
            question: The search query to embed.

        Returns:
            List of floats representing the embedding vector.
        """
        return self.embed_text(question)

    def upsert_for_note(
        self,
        storage,  # NoteStorage - avoid circular import
        user_id: str,
        note_id: str,
        title: str,
        content: str,
        tags: Optional[List[str]] = None,
    ) -> bool:
        """
        Generate and upsert embedding for a note.

        This is a convenience method that combines building the embedding text,
        generating the embedding, and upserting to storage in one call.

        Args:
            storage: NoteStorage instance for database operations.
            user_id: The user ID who owns the note.
            note_id: The note ID to create embedding for.
            title: Note title.
            content: Note content.
            tags: Optional list of tags.

        Returns:
            True if embedding was successfully upserted, False if embedding failed.
        """
        try:
            embedding_text = build_note_embedding_text(
                title=title,
                content=content,
                tags=tags or [],
            )
            h = content_hash(embedding_text)
            vec = self.embed_text(embedding_text)

            if not vec:
                return False

            # Format embedding value based on database dialect
            if storage.dialect == "postgresql":
                emb_value = vector_to_pg_literal(vec)
            else:
                emb_value = vector_to_json(vec)

            storage.upsert_note_embedding(
                user_id=user_id,
                note_id=note_id,
                embedding_model=self.model,
                content_hash=h,
                embedding_value=emb_value,
            )
            return True
        except Exception as e:
            print(f"Embedding upsert failed for note {note_id}: {e}")
            return False


