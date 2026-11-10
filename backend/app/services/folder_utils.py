from __future__ import annotations

from .models import FolderNode


def normalize_folder_path(path: str | None) -> str:
    """Single source of truth for folder path normalization."""
    parts = [part.strip() for part in (path or "").split("/") if part.strip()]
    return "/".join(parts)[:500] or "inbox"


def extract_folder_paths(node: FolderNode) -> list[str]:
    """
    Return all non-empty folder paths from a folder tree (depth-first).
    """
    paths: list[str] = []

    def visit(n: FolderNode) -> None:
        if n.path:
            paths.append(n.path)
        for sub in n.subfolders:
            visit(sub)

    visit(node)
    return paths


