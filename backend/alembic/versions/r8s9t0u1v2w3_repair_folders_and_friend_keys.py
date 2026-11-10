"""repair folder paths and friendship pair keys

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-11-10 19:00:00.000000

Earlier revisions on this branch could persist unnormalized folder paths and a
NOT NULL pair_key. This repair makes both safe for existing/dev databases and
for a rollback to the previous release.
"""
from contextlib import suppress
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = "r8s9t0u1v2w3"
down_revision: Union[str, None] = "q7r8s9t0u1v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STATUS_PRIORITY = {"accepted": 0, "pending": 1}


def _normalize(path: str | None) -> str:
    parts = [part.strip() for part in (path or "").split("/") if part.strip()]
    return "/".join(parts)[:500] or "inbox"


def _pair_key(user_a: str, user_b: str) -> str:
    low, high = sorted((user_a, user_b))
    return f"{low}|{high}"


def _repair_friendships(conn, dialect: str) -> None:
    with op.batch_alter_table("friendships") as batch_op:
        batch_op.alter_column(
            "pair_key",
            existing_type=sa.String(512),
            nullable=True,
            server_default=None,
        )
    with suppress(Exception):
        op.drop_index("idx_friendships_pair_key", table_name="friendships")

    rows = conn.execute(
        sa.text("SELECT id, requester_id, addressee_id, status FROM friendships")
    ).fetchall()
    groups: dict[str, list[tuple]] = {}
    for row in rows:
        groups.setdefault(_pair_key(row[1], row[2]), []).append(row)

    for pair_key, entries in groups.items():
        entries.sort(key=lambda row: (_STATUS_PRIORITY.get(row[3], 2), row[0]))
        keeper = entries[0]
        conn.execute(
            sa.text("UPDATE friendships SET pair_key = :pair_key WHERE id = :id"),
            {"pair_key": pair_key, "id": keeper[0]},
        )
        for row in entries[1:]:
            conn.execute(
                sa.text("DELETE FROM friendships WHERE id = :id"), {"id": row[0]}
            )

    op.create_index(
        "idx_friendships_pair_key",
        "friendships",
        ["pair_key"],
        unique=True,
        postgresql_where=sa.text("pair_key IS NOT NULL"),
        sqlite_where=sa.text("pair_key IS NOT NULL"),
    )


def _ensure_folder(conn, dialect: str, user_id: str, path: str) -> str:
    existing = conn.execute(
        sa.text("SELECT id FROM folders WHERE user_id = :user_id AND path = :path"),
        {"user_id": user_id, "path": path},
    ).scalar()
    if existing:
        return existing

    folder_id = str(uuid4())
    params = {
        "id": folder_id,
        "user_id": user_id,
        "path": path,
        "name": path.rsplit("/", 1)[-1],
        "parent": path.rsplit("/", 1)[0] if "/" in path else None,
    }
    if dialect == "postgresql":
        conn.execute(
            sa.text(
                "INSERT INTO folders "
                "(id, user_id, path, name, parent_path, created_at, updated_at) "
                "VALUES (:id, :user_id, :path, :name, :parent, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) "
                "ON CONFLICT (user_id, path) DO NOTHING"
            ),
            params,
        )
    else:
        conn.execute(
            sa.text(
                "INSERT OR IGNORE INTO folders "
                "(id, user_id, path, name, parent_path, created_at, updated_at) "
                "VALUES (:id, :user_id, :path, :name, :parent, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            params,
        )
    return conn.execute(
        sa.text("SELECT id FROM folders WHERE user_id = :user_id AND path = :path"),
        {"user_id": user_id, "path": path},
    ).scalar()


def _repair_folders(conn, dialect: str) -> None:
    # Normalize/dedupe folder entities first.
    folders = conn.execute(
        sa.text("SELECT id, user_id, path FROM folders")
    ).fetchall()
    for folder_id, user_id, path in folders:
        normalized = _normalize(path)
        if normalized == path:
            continue
        duplicate = conn.execute(
            sa.text(
                "SELECT id FROM folders WHERE user_id = :user_id "
                "AND path = :path AND id <> :id"
            ),
            {"user_id": user_id, "path": normalized, "id": folder_id},
        ).scalar()
        if duplicate:
            conn.execute(
                sa.text(
                    "UPDATE notes SET folder_id = :duplicate WHERE folder_id = :old"
                ),
                {"duplicate": duplicate, "old": folder_id},
            )
            conn.execute(
                sa.text("DELETE FROM folders WHERE id = :id"), {"id": folder_id}
            )
        else:
            conn.execute(
                sa.text(
                    "UPDATE folders SET path = :path, name = :name, "
                    "parent_path = :parent WHERE id = :id"
                ),
                {
                    "path": normalized,
                    "name": normalized.rsplit("/", 1)[-1],
                    "parent": (
                        normalized.rsplit("/", 1)[0]
                        if "/" in normalized
                        else None
                    ),
                    "id": folder_id,
                },
            )

    notes = conn.execute(
        sa.text("SELECT id, user_id, folder_path FROM notes")
    ).fetchall()
    for note_id, user_id, folder_path in notes:
        normalized = _normalize(folder_path)
        folder_id = _ensure_folder(conn, dialect, user_id, normalized)
        conn.execute(
            sa.text(
                "UPDATE notes SET folder_path = :path, folder_id = :folder_id "
                "WHERE id = :id"
            ),
            {"path": normalized, "folder_id": folder_id, "id": note_id},
        )


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")

    _repair_friendships(bind, dialect)
    _repair_folders(bind, dialect)


def downgrade() -> None:
    # Data repair only; nothing structural to undo.
    pass
