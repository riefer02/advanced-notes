#!/usr/bin/env python3
"""Small labeled evaluation for AICategorizationService.

Runs representative voice-note transcripts through the real categorizer and
scores two things:

- folder: predicted folder equals, is a parent of, or is a child of an
  acceptable folder.
- tags: at least N expected tags appear (contiguous token match with simple
  plural stemming, so "health" matches "dental-health" and "habits" matches
  "habit-formation").

Usage:
    cd backend
    .venv/bin/python ../scripts/eval_categorizer.py --trials 3

The eval calls OpenAI and costs a few cents. It is intentionally small: this
is a regression check for prompt/model changes, not a benchmark.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / "backend" / ".env")

from app.services.ai_categorizer import AICategorizationService  # noqa: E402
from app.services.usage_tracking import UsageTrackingService  # noqa: E402


@dataclass(frozen=True)
class Case:
    name: str
    transcription: str
    existing_folders: tuple[str, ...]
    acceptable_folders: tuple[str, ...]
    expected_tags: tuple[str, ...]
    min_tag_matches: int = 2


CASES: tuple[Case, ...] = (
    Case(
        name="work_project_meeting",
        transcription=(
            "Meeting notes for the Project Alpha kickoff. We agreed on the timeline, "
            "deliverables, and team roles. Action items: set up the repository, create "
            "the Jira board, and schedule weekly standups."
        ),
        existing_folders=("inbox", "work", "work/project-alpha", "work/meetings", "personal"),
        acceptable_folders=("work", "work/project-alpha", "work/meetings", "work/projects"),
        expected_tags=("project-alpha", "kickoff", "meeting", "meetings", "timeline", "deliverables"),
    ),
    Case(
        name="blog_react_performance",
        transcription=(
            "Blog idea: how to optimize React performance with useMemo and useCallback. "
            "Cover common pitfalls, profiling, and best practices for frontend teams."
        ),
        existing_folders=("inbox", "ideas", "work", "learning"),
        acceptable_folders=("ideas", "work", "learning", "blog-ideas"),
        expected_tags=("react", "performance", "frontend", "blog", "usememo"),
    ),
    Case(
        name="grocery_list",
        transcription=(
            "Need to buy milk, eggs, bread, coffee, apples, and bananas. "
            "Also pick up dish soap."
        ),
        existing_folders=("inbox", "groceries", "personal", "home"),
        acceptable_folders=("groceries", "personal", "shopping", "home"),
        expected_tags=("groceries", "shopping", "food", "milk", "eggs"),
    ),
    Case(
        name="personal_journal",
        transcription=(
            "Today was a really good day. I made progress on my side project, had a "
            "great workout at the gym, and spent time reading."
        ),
        existing_folders=("inbox", "personal", "personal/journal", "personal/health", "reading"),
        acceptable_folders=("personal", "personal/journal", "journal", "personal/health"),
        expected_tags=("journal", "reflection", "gym", "reading", "side-project"),
    ),
    Case(
        name="dentist_appointment",
        transcription=(
            "Remind me to book a dentist appointment next week. My tooth has been "
            "sensitive to cold drinks, and I should also ask about a cleaning."
        ),
        existing_folders=("inbox", "personal", "personal/health", "work"),
        acceptable_folders=("personal/health", "personal", "health", "todos"),
        expected_tags=("health", "dentist", "appointment", "appointments", "teeth"),
    ),
    Case(
        name="tax_prep",
        transcription=(
            "Tax notes: I need to gather the W-2, 1099 forms, and receipts for the home "
            "office deduction. The accountant wants everything by March 15."
        ),
        existing_folders=("inbox", "personal", "personal/finance", "work"),
        acceptable_folders=("personal/finance", "personal", "finance", "taxes"),
        expected_tags=("finance", "taxes", "tax", "w2", "w-2", "receipts", "accountant"),
    ),
    Case(
        name="portugal_trip",
        transcription=(
            "Planning the trip to Portugal in May. Need to book flights to Lisbon, "
            "find a hotel in Porto, and rent a car for the Douro Valley."
        ),
        existing_folders=("inbox", "travel", "personal", "personal/finance"),
        acceptable_folders=("travel", "personal", "trips", "vacation"),
        expected_tags=("travel", "portugal", "flight", "flights", "hotel", "lisbon"),
    ),
    Case(
        name="pasta_recipe",
        transcription=(
            "Recipe idea: creamy garlic pasta with mushrooms and spinach. Use parmesan, "
            "heavy cream, and a little lemon zest. Cook the mushrooms until golden."
        ),
        existing_folders=("inbox", "recipes", "personal", "home"),
        acceptable_folders=("recipes", "personal", "cooking", "food"),
        expected_tags=("recipe", "recipes", "pasta", "cooking", "mushrooms", "garlic"),
    ),
    Case(
        name="home_repair",
        transcription=(
            "The kitchen faucet is leaking under the sink. Need to call a plumber, buy "
            "a new cartridge, and check the shutoff valve. Also the back porch light is out."
        ),
        existing_folders=("inbox", "home", "personal", "work"),
        acceptable_folders=("home", "personal", "home/maintenance", "house"),
        expected_tags=("home", "plumbing", "repair", "faucet", "maintenance"),
    ),
    Case(
        name="learning_rust",
        transcription=(
            "Learning Rust: notes on ownership, borrowing, and lifetimes. I want to "
            "build a small CLI tool and read the async book next."
        ),
        existing_folders=("inbox", "learning", "work", "ideas"),
        acceptable_folders=("learning", "personal", "ideas", "programming"),
        expected_tags=("rust", "programming", "ownership", "borrowing", "learning"),
    ),
    Case(
        name="book_notes",
        transcription=(
            "Book notes from Atomic Habits: small improvements compound, focus on "
            "systems not goals, and make good habits obvious and easy. Favorite quote: "
            "'You do not rise to the level of your goals.'"
        ),
        existing_folders=("inbox", "reading", "learning", "personal"),
        acceptable_folders=("reading", "learning", "notes", "books"),
        expected_tags=("reading", "book", "books", "habits", "summary", "atomic-habits"),
    ),
    Case(
        name="acme_customer_call",
        transcription=(
            "Customer call with Acme Corp. They want a follow-up proposal by Friday, a "
            "demo of the analytics dashboard, and pricing for 50 seats. Renewal is at risk."
        ),
        existing_folders=("inbox", "work", "work/customers", "work/sales", "personal"),
        acceptable_folders=("work", "work/customers", "work/sales", "work/crm"),
        expected_tags=("acme", "customer", "sales", "proposal", "renewal"),
    ),
    Case(
        name="app_feature_idea",
        transcription=(
            "App idea: add a weekly review screen that shows notes created, todos "
            "completed, and top tags. Maybe include a streak counter and a quick export "
            "to markdown."
        ),
        existing_folders=("inbox", "ideas", "work", "personal"),
        acceptable_folders=("ideas", "work", "projects", "product"),
        expected_tags=("app", "feature", "product", "weekly-review", "export"),
    ),
    Case(
        name="passport_renewal",
        transcription=(
            "Remind me to renew my passport before the trip in June. I need new photos, "
            "the application form, and the old passport. Check the processing time."
        ),
        existing_folders=("inbox", "personal", "travel", "todos"),
        acceptable_folders=("personal", "travel", "todos", "personal/admin"),
        expected_tags=("passport", "travel", "renewal", "renew", "admin"),
    ),
    Case(
        name="workout_plan",
        transcription=(
            "Workout plan for the week: Monday push, Tuesday pull, Wednesday legs, "
            "Thursday rest, Friday upper body, Saturday cardio. Increase bench weight "
            "by 5 pounds."
        ),
        existing_folders=("inbox", "personal", "personal/health", "learning"),
        acceptable_folders=("personal/health", "personal", "health", "fitness"),
        expected_tags=("workout", "fitness", "gym", "plan", "health"),
    ),
)


def normalize_folder(value: str) -> str:
    value = value.strip().lower().replace("_", "-")
    value = re.sub(r"\s+", "-", value)
    value = re.sub(r"/+", "/", value)
    return value.strip("/")


def folder_matches(predicted: str, acceptable: tuple[str, ...]) -> bool:
    p = normalize_folder(predicted)
    for candidate in acceptable:
        a = normalize_folder(candidate)
        if not a:
            continue
        if p == a or p.startswith(a + "/") or a.startswith(p + "/"):
            return True
    return False


def _stem(token: str) -> str:
    """Crude plural stemming for tags: habits -> habit, books -> book."""
    if len(token) > 3 and token.endswith("s") and not token.endswith(("ss", "us", "is")):
        return token[:-1]
    return token


def tag_tokens(value: str) -> list[str]:
    value = value.strip().lower().replace("_", "-")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return [_stem(part) for part in value.split("-") if part]


def tag_matches(expected: str, predicted: str) -> bool:
    """Match contiguous token runs: "health" matches "dental-health"."""
    e = tag_tokens(expected)
    p = tag_tokens(predicted)
    if not e or not p:
        return False
    if len(e) > len(p):
        e, p = p, e
    return any(p[i : i + len(e)] == e for i in range(len(p) - len(e) + 1))


def score_case(case: Case, result) -> dict:  # noqa: ANN001
    suggestion = result.suggestion
    matched_tags = sorted(
        {
            expected
            for expected in case.expected_tags
            if any(tag_matches(expected, tag) for tag in suggestion.tags)
        }
    )
    folder_ok = folder_matches(suggestion.folder_path, case.acceptable_folders)
    tag_ok = len(matched_tags) >= case.min_tag_matches
    return {
        "case": case.name,
        "folder": suggestion.folder_path,
        "folder_ok": folder_ok,
        "tags": suggestion.tags,
        "matched_tags": matched_tags,
        "tag_ok": tag_ok,
        "overall_ok": folder_ok and tag_ok,
        "confidence": suggestion.confidence,
        "action": suggestion.action.value,
        "prompt_tokens": result.usage.prompt_tokens if result.usage else 0,
        "completion_tokens": result.usage.completion_tokens if result.usage else 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trials", type=int, default=3)
    parser.add_argument("--json-out", type=Path)
    args = parser.parse_args()

    service = AICategorizationService()
    print(f"model: {service.model}")
    print(f"cases: {len(CASES)}  trials: {args.trials}  runs: {len(CASES) * args.trials}")
    print()

    runs: list[dict] = []
    for trial in range(args.trials):
        print(f"--- trial {trial + 1}/{args.trials} ---")
        for case in CASES:
            try:
                result = service.categorize(
                    case.transcription,
                    list(case.existing_folders),
                    return_usage=True,
                )
                record = score_case(case, result)
            except Exception as exc:  # noqa: BLE001
                record = {
                    "case": case.name,
                    "folder": "",
                    "folder_ok": False,
                    "tags": [],
                    "matched_tags": [],
                    "tag_ok": False,
                    "overall_ok": False,
                    "confidence": 0.0,
                    "action": "error",
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "error": f"{type(exc).__name__}: {exc}",
                }
            record["trial"] = trial + 1
            runs.append(record)
            status = "PASS" if record["overall_ok"] else "FAIL"
            print(
                f"{status} {case.name:24} folder={record['folder']!r:28} "
                f"matched={','.join(record['matched_tags']) or '-'}"
            )
        print()

    total = len(runs)
    folder_ok = sum(1 for r in runs if r["folder_ok"])
    tag_ok = sum(1 for r in runs if r["tag_ok"])
    overall_ok = sum(1 for r in runs if r["overall_ok"])
    by_case: dict[str, list[dict]] = {}
    for record in runs:
        by_case.setdefault(record["case"], []).append(record)
    pass_at_least_once = sum(1 for records in by_case.values() if any(r["overall_ok"] for r in records))
    always_pass = sum(1 for records in by_case.values() if all(r["overall_ok"] for r in records))

    prompt_tokens = sum(r["prompt_tokens"] for r in runs)
    completion_tokens = sum(r["completion_tokens"] for r in runs)
    estimated_cost = UsageTrackingService()._estimate_cost(
        service.model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )

    print("=== summary ===")
    print(f"runs: {total}")
    print(f"folder accuracy: {folder_ok}/{total} = {folder_ok / total:.1%}")
    print(f"tag accuracy:    {tag_ok}/{total} = {tag_ok / total:.1%}")
    print(f"overall accuracy:{overall_ok}/{total} = {overall_ok / total:.1%}")
    print(f"cases pass@trials (any): {pass_at_least_once}/{len(by_case)}")
    print(f"cases pass every trial: {always_pass}/{len(by_case)}")
    print(f"tokens: prompt={prompt_tokens} completion={completion_tokens}")
    print(f"estimated cost: ${estimated_cost:.4f}")

    if args.json_out:
        args.json_out.write_text(
            json.dumps(
                {
                    "model": service.model,
                    "trials": args.trials,
                    "summary": {
                        "runs": total,
                        "folder_accuracy": folder_ok / total,
                        "tag_accuracy": tag_ok / total,
                        "overall_accuracy": overall_ok / total,
                        "cases_pass_at_least_once": pass_at_least_once,
                        "cases_always_pass": always_pass,
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "estimated_cost_usd": estimated_cost,
                    },
                    "cases": [asdict(case) for case in CASES],
                    "runs": runs,
                },
                indent=2,
            )
        )
        print(f"wrote {args.json_out}")

    return 0 if overall_ok == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
