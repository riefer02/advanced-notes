"""add normalized tags and note_tags

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-11-10 16:00:00.000000

Backfills from the legacy notes.tags JSON text. `notes.tags` is kept as a
compatibility cache and dual-written by the storage layer, so old code and
old clients continue to work.
"""
import json
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = "o5p6q7r8s9t0"
down_revision: Union[str, None] = "n4o5p6q7r8s9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("name_norm", sa.String(100), nullable=False),
        sa.Column(
            "created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("user_id", "name_norm", name="uq_tags_user_name_norm"),
    )
    op.create_index("idx_tags_user_name", "tags", ["user_id", "name"])

    op.create_table(
        "note_tags",
        sa.Column(
            "note_id",
            sa.String(36),
            sa.ForeignKey("notes.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tag_id",
            sa.String(36),
            sa.ForeignKey("tags.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("user_id", sa.String(255), nullable=False),
    )
    op.create_index("idx_note_tags_user_tag", "note_tags", ["user_id", "tag_id"])
    op.create_index("idx_note_tags_tag_note", "note_tags", ["tag_id", "note_id"])

    conn = op.get_bind()
    dialect = conn.dialect.name
    rows = conn.execute(
        sa.text(
            "SELECT id, user_id, tags FROM notes "
            "WHERE tags IS NOT NULL AND CAST(tags AS TEXT) <> ''"
        )
    ).fetchall()

    for note_id, user_id, raw in rows:
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError):
            continue
        if not isinstance(parsed, list):
            continue

        for value in parsed:
            name = str(value).strip()
            name_norm = name.lower()
            if not name_norm:
                continue

            tag_id = conn.execute(
                sa.text(
                    "SELECT id FROM tags WHERE user_id = :user_id "
                    "AND name_norm = :name_norm"
                ),
                {"user_id": user_id, "name_norm": name_norm},
            ).scalar()

            if tag_id is None:
                candidate = str(uuid4())
                params = {
                    "id": candidate,
                    "user_id": user_id,
                    "name": name_norm[:100],
                    "name_norm": name_norm[:100],
                }
                if dialect == "postgresql":
                    conn.execute(
                        sa.text(
                            "INSERT INTO tags "
                            "(id, user_id, name, name_norm, created_at) "
                            "VALUES (:id, :user_id, :name, :name_norm, CURRENT_TIMESTAMP) "
                            "ON CONFLICT (user_id, name_norm) DO NOTHING"
                        ),
                        params,
                    )
                else:
                    conn.execute(
                        sa.text(
                            "INSERT OR IGNORE INTO tags "
                            "(id, user_id, name, name_norm, created_at) "
                            "VALUES (:id, :user_id, :name, :name_norm, CURRENT_TIMESTAMP)"
                        ),
                        params,
                    )
                tag_id = conn.execute(
                    sa.text(
                        "SELECT id FROM tags WHERE user_id = :user_id "
                        "AND name_norm = :name_norm"
                    ),
                    {"user_id": user_id, "name_norm": name_norm},
                ).scalar()

            if tag_id is None:
                continue

            links = {"note_id": note_id, "tag_id": tag_id, "user_id": user_id}
            if dialect == "postgresql":
                conn.execute(
                    sa.text(
                        "INSERT INTO note_tags (note_id, tag_id, user_id) "
                        "VALUES (:note_id, :tag_id, :user_id) "
                        "ON CONFLICT DO NOTHING"
                    ),
                    links,
                )
            else:
                conn.execute(
                    sa.text(
                        "INSERT OR IGNORE INTO note_tags "
                        "(note_id, tag_id, user_id) "
                        "VALUES (:note_id, :tag_id, :user_id)"
                    ),
                    links,
                )


def downgrade() -> None:
    op.drop_index("idx_note_tags_tag_note", table_name="note_tags")
    op.drop_index("idx_note_tags_user_tag", table_name="note_tags")
    op.drop_table("note_tags")
    op.drop_index("idx_tags_user_name", table_name="tags")
    op.drop_table("tags")
