from __future__ import annotations

from .models import FolderNode


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


