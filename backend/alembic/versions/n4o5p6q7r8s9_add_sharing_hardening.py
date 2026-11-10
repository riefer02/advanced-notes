"""sharing hardening: unordered friend pairs and per-resource shares

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-11-10 15:00:00.000000

pair_key is nullable and only unique when present, so the previous release can
still insert friendships during a rollback window. Backfill/dedupe is done in
Python to match the runtime pair-key ordering exactly (DB collations differ).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n4o5p6q7r8s9"
down_revision: Union[str, None] = "m3n4o5p6q7r8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STATUS_PRIORITY = {"accepted": 0, "pending": 1}


def _pair_key(user_a: str, user_b: str) -> str:
    low, high = sorted((user_a, user_b))
    return f"{low}|{high}"


def _dedupe_friendships(conn) -> None:
    rows = conn.execute(
        sa.text(
            "SELECT id, requester_id, addressee_id, status FROM friendships"
        )
    ).fetchall()
    groups: dict[str, list[tuple]] = {}
    for row in rows:
        groups.setdefault(_pair_key(row[1], row[2]), []).append(row)

    for pair_key, entries in groups.items():
        entries.sort(
            key=lambda row: (
                _STATUS_PRIORITY.get(row[3], 2),
                row[0],
            )
        )
        keeper = entries[0]
        conn.execute(
            sa.text("UPDATE friendships SET pair_key = :pair_key WHERE id = :id"),
            {"pair_key": pair_key, "id": keeper[0]},
        )
        for row in entries[1:]:
            conn.execute(
                sa.text("DELETE FROM friendships WHERE id = :id"),
                {"id": row[0]},
            )


def _dedupe_resource_shares(conn) -> None:
    rows = conn.execute(
        sa.text(
            "SELECT id, owner_id, shared_with_id, resource_type, resource_key "
            "FROM resource_shares"
        )
    ).fetchall()
    groups: dict[tuple[str, str, str], list[tuple]] = {}
    for row in rows:
        key = (row[1], row[2], row[3])
        groups.setdefault(key, []).append(row)

    for entries in groups.values():
        # Prefer the collection-wide grant, then the oldest row.
        entries.sort(key=lambda row: (0 if row[4] == "" else 1, row[0]))
        for row in entries[1:]:
            conn.execute(
                sa.text("DELETE FROM resource_shares WHERE id = :id"),
                {"id": row[0]},
            )


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")

    # --- friendships: normalized unordered pair ---
    op.add_column(
        "friendships", sa.Column("pair_key", sa.String(512), nullable=True)
    )
    _dedupe_friendships(bind)
    op.create_index(
        "idx_friendships_pair_key",
        "friendships",
        ["pair_key"],
        unique=True,
        postgresql_where=sa.text("pair_key IS NOT NULL"),
        sqlite_where=sa.text("pair_key IS NOT NULL"),
    )

    # --- resource shares: optional per-resource grants ---
    op.add_column(
        "resource_shares", sa.Column("resource_id", sa.String(36), nullable=True)
    )
    op.add_column(
        "resource_shares",
        sa.Column("resource_key", sa.String(64), nullable=False, server_default=""),
    )

    op.drop_index("idx_resource_shares_unique", table_name="resource_shares")
    op.create_index(
        "idx_resource_shares_unique",
        "resource_shares",
        ["owner_id", "shared_with_id", "resource_type", "resource_key"],
        unique=True,
    )


def downgrade() -> None:
    bind = op.get_bind()

    # Per-resource shares make the old type-wide unique index invalid; collapse
    # them (prefer the collection-wide grant) so a rollback can actually run.
    _dedupe_resource_shares(bind)
    op.drop_index("idx_resource_shares_unique", table_name="resource_shares")
    op.create_index(
        "idx_resource_shares_unique",
        "resource_shares",
        ["owner_id", "shared_with_id", "resource_type"],
        unique=True,
    )
    with op.batch_alter_table("resource_shares") as batch_op:
        batch_op.drop_column("resource_key")
        batch_op.drop_column("resource_id")

    op.drop_index("idx_friendships_pair_key", table_name="friendships")
    with op.batch_alter_table("friendships") as batch_op:
        batch_op.drop_column("pair_key")
