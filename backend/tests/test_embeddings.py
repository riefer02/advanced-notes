"""
Tests for embedding utility functions in app/services/embeddings.py.

Tests pure functions that don't require external dependencies.
"""
from __future__ import annotations

import json
import math

import pytest

from app.services.embeddings import (
    build_note_embedding_text,
    content_hash,
    cosine_similarity,
    normalize_similarity,
    vector_from_json,
    vector_to_json,
    vector_to_pg_literal,
)


# ============================================================================
# build_note_embedding_text
# ============================================================================


def test_build_note_embedding_text_basic():
    """Combines title, tags, and content."""
    result = build_note_embedding_text(
        title="My Note",
        content="This is the content",
        tags=["python", "coding"],
    )
    assert "Title: My Note" in result
    assert "Tags: python, coding" in result
    assert "Content:\nThis is the content" in result


def test_build_note_embedding_text_empty_tags():
    """Handles empty tags list."""
    result = build_note_embedding_text(
        title="No Tags",
        content="Content here",
        tags=[],
    )
    assert "Tags: " in result
    assert "Title: No Tags" in result


def test_build_note_embedding_text_none_tags():
    """Handles None tags."""
    result = build_note_embedding_text(
        title="None Tags",
        content="Content here",
        tags=None,
    )
    assert "Tags: " in result


def test_build_note_embedding_text_empty_content():
    """Handles empty content."""
    result = build_note_embedding_text(
        title="Title",
        content="",
        tags=["tag"],
    )
    assert "Title: Title" in result
    assert "Content:\n" in result


# ============================================================================
# content_hash
# ============================================================================


def test_content_hash_deterministic():
    """Same input produces same hash."""
    text = "Hello, world!"
    hash1 = content_hash(text)
    hash2 = content_hash(text)
    assert hash1 == hash2


def test_content_hash_different_inputs():
    """Different inputs produce different hashes."""
    hash1 = content_hash("Hello")
    hash2 = content_hash("World")
    assert hash1 != hash2


def test_content_hash_returns_hex():
    """Returns a valid SHA256 hex string."""
    result = content_hash("test")
    assert len(result) == 64  # SHA256 produces 64 hex chars
    assert all(c in "0123456789abcdef" for c in result)


def test_content_hash_empty_string():
    """Handles empty string."""
    result = content_hash("")
    # SHA256 of empty string is well-known
    assert result == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


# ============================================================================
# cosine_similarity
# ============================================================================


def test_cosine_similarity_identical_vectors():
    """Identical vectors have similarity 1.0."""
    vec = [1.0, 2.0, 3.0]
    assert cosine_similarity(vec, vec) == pytest.approx(1.0)


def test_cosine_similarity_orthogonal_vectors():
    """Orthogonal vectors have similarity 0.0."""
    vec_a = [1.0, 0.0]
    vec_b = [0.0, 1.0]
    assert cosine_similarity(vec_a, vec_b) == pytest.approx(0.0)


def test_cosine_similarity_opposite_vectors():
    """Opposite vectors have similarity -1.0."""
    vec_a = [1.0, 0.0]
    vec_b = [-1.0, 0.0]
    assert cosine_similarity(vec_a, vec_b) == pytest.approx(-1.0)


def test_cosine_similarity_empty_vectors():
    """Empty vectors return 0.0."""
    assert cosine_similarity([], []) == 0.0


def test_cosine_similarity_different_lengths():
    """Vectors of different lengths return 0.0."""
    vec_a = [1.0, 2.0]
    vec_b = [1.0, 2.0, 3.0]
    assert cosine_similarity(vec_a, vec_b) == 0.0


def test_cosine_similarity_zero_vector():
    """Zero vector returns 0.0."""
    vec_a = [1.0, 2.0]
    vec_b = [0.0, 0.0]
    assert cosine_similarity(vec_a, vec_b) == 0.0


def test_cosine_similarity_both_zero_vectors():
    """Both zero vectors return 0.0."""
    vec_a = [0.0, 0.0]
    vec_b = [0.0, 0.0]
    assert cosine_similarity(vec_a, vec_b) == 0.0


def test_cosine_similarity_scaled_vectors():
    """Scaled versions of same vector have similarity 1.0."""
    vec_a = [1.0, 2.0, 3.0]
    vec_b = [2.0, 4.0, 6.0]
    assert cosine_similarity(vec_a, vec_b) == pytest.approx(1.0)


def test_cosine_similarity_known_value():
    """Test against known computed value."""
    vec_a = [1.0, 2.0, 3.0]
    vec_b = [4.0, 5.0, 6.0]
    # dot = 1*4 + 2*5 + 3*6 = 32
    # |a| = sqrt(14), |b| = sqrt(77)
    # similarity = 32 / sqrt(14 * 77) = 32 / sqrt(1078) ≈ 0.9746
    expected = 32.0 / math.sqrt(14 * 77)
    assert cosine_similarity(vec_a, vec_b) == pytest.approx(expected)


# ============================================================================
# normalize_similarity
# ============================================================================


def test_normalize_similarity_one():
    """Similarity 1.0 maps to 1.0."""
    assert normalize_similarity(1.0) == pytest.approx(1.0)


def test_normalize_similarity_zero():
    """Similarity 0.0 maps to 0.5."""
    assert normalize_similarity(0.0) == pytest.approx(0.5)


def test_normalize_similarity_negative_one():
    """Similarity -1.0 maps to 0.0."""
    assert normalize_similarity(-1.0) == pytest.approx(0.0)


def test_normalize_similarity_clamps_high():
    """Values > 1.0 are clamped to 1.0."""
    assert normalize_similarity(1.5) == pytest.approx(1.0)


def test_normalize_similarity_clamps_low():
    """Values < -1.0 are clamped to 0.0."""
    assert normalize_similarity(-1.5) == pytest.approx(0.0)


def test_normalize_similarity_midpoint():
    """Similarity 0.5 maps to 0.75."""
    assert normalize_similarity(0.5) == pytest.approx(0.75)


# ============================================================================
# vector_to_pg_literal
# ============================================================================


def test_vector_to_pg_literal_basic():
    """Converts vector to pgvector literal format."""
    vec = [1.0, 2.5, 3.0]
    result = vector_to_pg_literal(vec)
    assert result.startswith("[")
    assert result.endswith("]")
    # Should have 8 decimal places
    assert "1.00000000" in result


def test_vector_to_pg_literal_empty():
    """Empty vector produces empty brackets."""
    result = vector_to_pg_literal([])
    assert result == "[]"


def test_vector_to_pg_literal_single():
    """Single element vector."""
    result = vector_to_pg_literal([0.5])
    assert result == "[0.50000000]"


def test_vector_to_pg_literal_precision():
    """Maintains 8 decimal precision."""
    vec = [0.123456789]
    result = vector_to_pg_literal(vec)
    # Should round to 8 places
    assert "[0.12345679]" in result


# ============================================================================
# vector_to_json / vector_from_json
# ============================================================================


def test_vector_to_json_basic():
    """Converts vector to JSON string."""
    vec = [1.0, 2.0, 3.0]
    result = vector_to_json(vec)
    assert json.loads(result) == vec


def test_vector_to_json_empty():
    """Empty vector produces empty JSON array."""
    result = vector_to_json([])
    assert result == "[]"


def test_vector_from_json_basic():
    """Parses JSON string to vector."""
    json_str = "[1.0, 2.0, 3.0]"
    result = vector_from_json(json_str)
    assert result == [1.0, 2.0, 3.0]


def test_vector_from_json_integers():
    """Converts integers to floats."""
    json_str = "[1, 2, 3]"
    result = vector_from_json(json_str)
    assert result == [1.0, 2.0, 3.0]
    assert all(isinstance(x, float) for x in result)


def test_vector_from_json_empty():
    """Empty JSON array produces empty list."""
    result = vector_from_json("[]")
    assert result == []


def test_vector_from_json_invalid_json():
    """Invalid JSON returns empty list."""
    result = vector_from_json("not valid json")
    assert result == []


def test_vector_from_json_non_array():
    """Non-array JSON returns empty list."""
    result = vector_from_json('{"key": "value"}')
    assert result == []


def test_vector_from_json_null():
    """JSON null returns empty list."""
    result = vector_from_json("null")
    assert result == []


def test_vector_roundtrip():
    """Vector survives JSON roundtrip."""
    original = [0.1, 0.2, 0.3, 0.4]
    json_str = vector_to_json(original)
    recovered = vector_from_json(json_str)
    assert recovered == original
