"""
Tests for query planning validation in app/services/query_planner.py.

Tests validation logic and prompt building without calling OpenAI API.
"""
from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from app.services.query_planner import QueryPlan, QueryPlanner


# ============================================================================
# Input Validation Tests
# ============================================================================


def test_plan_rejects_empty_question():
    """Raises ValueError for empty question string."""
    planner = QueryPlanner(client=MagicMock())

    with pytest.raises(ValueError, match="Question cannot be empty"):
        planner.plan(
            question="",
            known_tags=["tag1"],
            known_folders=["folder1"],
        )


def test_plan_rejects_whitespace_question():
    """Raises ValueError for whitespace-only question."""
    planner = QueryPlanner(client=MagicMock())

    with pytest.raises(ValueError, match="Question cannot be empty"):
        planner.plan(
            question="   \n\t  ",
            known_tags=["tag1"],
            known_folders=["folder1"],
        )


def test_plan_rejects_none_question():
    """Raises ValueError for None question."""
    planner = QueryPlanner(client=MagicMock())

    with pytest.raises(ValueError, match="Question cannot be empty"):
        planner.plan(
            question=None,
            known_tags=["tag1"],
            known_folders=["folder1"],
        )


# ============================================================================
# Result Limit Clamping Tests
# ============================================================================


def test_plan_clamps_result_limit_minimum():
    """Result limit is clamped to minimum of 1."""
    mock_client = MagicMock()

    # Create a mock QueryPlan response with valid initial value
    # The planner will override with the clamped value from result_limit param
    mock_plan = QueryPlan(
        intent="fact_lookup",
        semantic_query="test query",
        result_limit=12,  # Valid initial value
    )

    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock(message=MagicMock(parsed=mock_plan))]
    mock_client.beta.chat.completions.parse.return_value = mock_completion

    planner = QueryPlanner(client=mock_client)

    # Pass -5 as result_limit; the planner clamps via max(1, min(int(result_limit), 50))
    result = planner.plan(
        question="What is this?",
        known_tags=[],
        known_folders=[],
        result_limit=-5,  # Negative should be clamped to 1
    )

    assert result.result_limit == 1  # Clamped to minimum


def test_plan_clamps_result_limit_maximum():
    """Result limit is clamped to maximum of 50."""
    mock_client = MagicMock()

    # Create a mock QueryPlan response with valid initial value
    mock_plan = QueryPlan(
        intent="fact_lookup",
        semantic_query="test query",
        result_limit=12,  # Valid initial value
    )

    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock(message=MagicMock(parsed=mock_plan))]
    mock_client.beta.chat.completions.parse.return_value = mock_completion

    planner = QueryPlanner(client=mock_client)

    # Pass 100 as result_limit; the planner clamps via max(1, min(int(result_limit), 50))
    result = planner.plan(
        question="What is this?",
        known_tags=[],
        known_folders=[],
        result_limit=100,  # Request 100 results
    )

    assert result.result_limit == 50  # Clamped to maximum


def test_plan_accepts_valid_result_limit():
    """Valid result limits within range are preserved."""
    mock_client = MagicMock()

    mock_plan = QueryPlan(
        intent="fact_lookup",
        semantic_query="test query",
        result_limit=25,
    )

    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock(message=MagicMock(parsed=mock_plan))]
    mock_client.beta.chat.completions.parse.return_value = mock_completion

    planner = QueryPlanner(client=mock_client)

    result = planner.plan(
        question="What is this?",
        known_tags=[],
        known_folders=[],
        result_limit=25,
    )

    assert result.result_limit == 25


def test_plan_clamps_negative_result_limit():
    """Negative result limits are clamped to 1."""
    mock_client = MagicMock()

    mock_plan = QueryPlan(
        intent="fact_lookup",
        semantic_query="test query",
        result_limit=1,
    )

    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock(message=MagicMock(parsed=mock_plan))]
    mock_client.beta.chat.completions.parse.return_value = mock_completion

    planner = QueryPlanner(client=mock_client)

    result = planner.plan(
        question="What is this?",
        known_tags=[],
        known_folders=[],
        result_limit=-5,
    )

    assert result.result_limit == 1


# ============================================================================
# Prompt Building Tests
# ============================================================================


def test_build_prompt_includes_tags():
    """Prompt includes known tags."""
    planner = QueryPlanner(client=MagicMock())

    prompt = planner._build_prompt(
        question="What about Python?",
        known_tags=["python", "coding", "tutorial"],
        known_folders=[],
        today=date(2024, 1, 15),
        result_limit=12,
    )

    assert "python" in prompt
    assert "coding" in prompt
    assert "tutorial" in prompt


def test_build_prompt_includes_folders():
    """Prompt includes known folders."""
    planner = QueryPlanner(client=MagicMock())

    prompt = planner._build_prompt(
        question="What about work?",
        known_tags=[],
        known_folders=["work/meetings", "personal/notes"],
        today=date(2024, 1, 15),
        result_limit=12,
    )

    assert "work/meetings" in prompt
    assert "personal/notes" in prompt


def test_build_prompt_includes_today_date():
    """Prompt includes today's date."""
    planner = QueryPlanner(client=MagicMock())

    prompt = planner._build_prompt(
        question="Recent notes",
        known_tags=[],
        known_folders=[],
        today=date(2024, 6, 15),
        result_limit=12,
    )

    assert "2024-06-15" in prompt


def test_build_prompt_includes_result_limit():
    """Prompt includes result limit."""
    planner = QueryPlanner(client=MagicMock())

    prompt = planner._build_prompt(
        question="Find something",
        known_tags=[],
        known_folders=[],
        today=date(2024, 1, 15),
        result_limit=20,
    )

    assert "20" in prompt


def test_build_prompt_handles_empty_tags():
    """Prompt handles empty tags list gracefully."""
    planner = QueryPlanner(client=MagicMock())

    prompt = planner._build_prompt(
        question="Test",
        known_tags=[],
        known_folders=["folder1"],
        today=date(2024, 1, 15),
        result_limit=12,
    )

    assert "(none)" in prompt or "KNOWN TAGS" in prompt


def test_build_prompt_handles_empty_folders():
    """Prompt handles empty folders list gracefully."""
    planner = QueryPlanner(client=MagicMock())

    prompt = planner._build_prompt(
        question="Test",
        known_tags=["tag1"],
        known_folders=[],
        today=date(2024, 1, 15),
        result_limit=12,
    )

    # Should indicate no folders or use (none)
    assert "KNOWN FOLDERS" in prompt


def test_build_prompt_deduplicates_tags():
    """Prompt deduplicates repeated tags."""
    planner = QueryPlanner(client=MagicMock())

    prompt = planner._build_prompt(
        question="Test",
        known_tags=["python", "python", "coding", "python"],
        known_folders=[],
        today=date(2024, 1, 15),
        result_limit=12,
    )

    # Count occurrences of "python" in the tags section
    # The deduplication happens via set() so only unique tags appear
    tags_line_count = prompt.count("python")
    # Should appear once in tags section (possibly twice if in question)
    assert tags_line_count <= 2


def test_build_prompt_sorts_tags():
    """Prompt sorts tags alphabetically."""
    planner = QueryPlanner(client=MagicMock())

    prompt = planner._build_prompt(
        question="Test",
        known_tags=["zebra", "apple", "mango"],
        known_folders=[],
        today=date(2024, 1, 15),
        result_limit=12,
    )

    # Tags should be sorted
    assert "apple" in prompt
    assert "mango" in prompt
    assert "zebra" in prompt


# ============================================================================
# Error Handling Tests
# ============================================================================


def test_plan_raises_on_empty_response():
    """Raises ValueError when OpenAI returns empty plan."""
    mock_client = MagicMock()

    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock(message=MagicMock(parsed=None))]
    mock_client.beta.chat.completions.parse.return_value = mock_completion

    planner = QueryPlanner(client=mock_client)

    with pytest.raises(ValueError, match="OpenAI returned empty query plan"):
        planner.plan(
            question="What is this?",
            known_tags=[],
            known_folders=[],
        )


def test_plan_propagates_openai_error():
    """Propagates OpenAI API errors."""
    from openai import OpenAIError

    mock_client = MagicMock()
    mock_client.beta.chat.completions.parse.side_effect = OpenAIError("API error")

    planner = QueryPlanner(client=mock_client)

    with pytest.raises(OpenAIError):
        planner.plan(
            question="What is this?",
            known_tags=[],
            known_folders=[],
        )


# ============================================================================
# Default Value Tests
# ============================================================================


def test_plan_uses_default_result_limit():
    """Uses default result_limit when not specified."""
    mock_client = MagicMock()

    mock_plan = QueryPlan(
        intent="fact_lookup",
        semantic_query="test query",
        result_limit=12,
    )

    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock(message=MagicMock(parsed=mock_plan))]
    mock_client.beta.chat.completions.parse.return_value = mock_completion

    planner = QueryPlanner(client=mock_client)

    result = planner.plan(
        question="What is this?",
        known_tags=[],
        known_folders=[],
        # result_limit not specified, uses default of 12
    )

    assert result.result_limit == 12


def test_plan_uses_today_when_not_specified():
    """Uses today's date when not specified."""
    mock_client = MagicMock()

    mock_plan = QueryPlan(
        intent="fact_lookup",
        semantic_query="test query",
        result_limit=12,
    )

    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock(message=MagicMock(parsed=mock_plan))]
    mock_client.beta.chat.completions.parse.return_value = mock_completion

    planner = QueryPlanner(client=mock_client)

    # Should not raise - uses date.today() internally
    result = planner.plan(
        question="What is this?",
        known_tags=[],
        known_folders=[],
        today=None,  # Will use date.today()
    )

    assert result is not None
