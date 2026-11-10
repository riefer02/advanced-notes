"""add note lifecycle and revisions

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-11-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k1l2m3n4o5p6"
down_revision: Union[str, None] = "j0k1l2m3n4o5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "notes",
        sa.Column(
            "source", sa.String(20), nullable=False, server_default="audio"
        ),
    )
    op.add_column("notes", sa.Column("language", sa.String(10), nullable=True))
    op.add_column(
        "notes",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("notes", sa.Column("pinned_at", sa.TIMESTAMP(), nullable=True))
    op.add_column("notes", sa.Column("archived_at", sa.TIMESTAMP(), nullable=True))
    op.add_column("notes", sa.Column("deleted_at", sa.TIMESTAMP(), nullable=True))

    op.create_index(
        "idx_notes_user_visibility",
        "notes",
        ["user_id", "deleted_at", "archived_at", "updated_at"],
    )
    op.create_index("idx_notes_user_pinned", "notes", ["user_id", "pinned_at"])

    op.create_table(
        "note_revisions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "note_id",
            sa.String(36),
            sa.ForeignKey("notes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("folder_path", sa.Text(), nullable=False),
        sa.Column("tags", sa.Text(), nullable=True),
        sa.Column("word_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "edit_source", sa.String(20), nullable=False, server_default="user"
        ),
        sa.Column(
            "created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint(
            "note_id", "version", name="uq_note_revisions_note_version"
        ),
    )
    op.create_index(
        "idx_note_revisions_user_created",
        "note_revisions",
        ["user_id", "created_at"],
    )
    op.create_index(
        "idx_note_revisions_note", "note_revisions", ["note_id", "version"]
    )

    # Existing rows created by the manual-note endpoint predate the column.
    op.execute("UPDATE notes SET source = 'manual' WHERE model_version = 'manual'")


def downgrade() -> None:
    op.drop_index("idx_note_revisions_note", table_name="note_revisions")
    op.drop_index("idx_note_revisions_user_created", table_name="note_revisions")
    op.drop_table("note_revisions")

    op.drop_index("idx_notes_user_pinned", table_name="notes")
    op.drop_index("idx_notes_user_visibility", table_name="notes")

    with op.batch_alter_table("notes") as batch_op:
        batch_op.drop_column("deleted_at")
        batch_op.drop_column("archived_at")
        batch_op.drop_column("pinned_at")
        batch_op.drop_column("version")
        batch_op.drop_column("language")
        batch_op.drop_column("source")
