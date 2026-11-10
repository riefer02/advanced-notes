"""add folders and transcripts

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-11-10 17:00:00.000000

Expand phase:
- folders is the rename-capable entity; notes.folder_path stays the read cache.
- transcripts stores raw ASR output while notes keeps its legacy metadata
  columns for compatibility. A later contract migration can drop them.
"""
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = "p6q7r8s9t0u1"
down_revision: Union[str, None] = "o5p6q7r8s9t0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalize(path: str | None) -> str:
    parts = [part.strip() for part in (path or "").split("/") if part.strip()]
    return "/".join(parts)[:500] or "inbox"


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    op.create_table(
        "folders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("path", sa.String(500), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("parent_path", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("user_id", "path", name="uq_folders_user_path"),
    )
    op.create_index("idx_folders_user_path", "folders", ["user_id", "path"])

    op.add_column("notes", sa.Column("folder_id", sa.String(36), nullable=True))
    op.create_index("idx_notes_user_folder_id", "notes", ["user_id", "folder_id"])
    if dialect == "postgresql":
        op.create_foreign_key(
            "fk_notes_folder_id",
            "notes",
            "folders",
            ["folder_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # Backfill one folder row per distinct note path, then link the notes.
    rows = bind.execute(
        sa.text("SELECT DISTINCT user_id, folder_path FROM notes")
    ).fetchall()
    folder_ids: dict[tuple[str, str], str] = {}
    for user_id, folder_path in rows:
        path = _normalize(folder_path)
        key = (user_id, path)
        if key in folder_ids:
            continue
        folder_id = str(uuid4())
        bind.execute(
            sa.text(
                "INSERT INTO folders "
                "(id, user_id, path, name, parent_path, created_at, updated_at) "
                "VALUES (:id, :user_id, :path, :name, :parent, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {
                "id": folder_id,
                "user_id": user_id,
                "path": path,
                "name": path.rsplit("/", 1)[-1],
                "parent": path.rsplit("/", 1)[0] if "/" in path else None,
            },
        )
        folder_ids[key] = folder_id

    notes = bind.execute(sa.text("SELECT id, user_id, folder_path FROM notes")).fetchall()
    for note_id, user_id, folder_path in notes:
        folder_id = folder_ids.get((user_id, _normalize(folder_path)))
        if folder_id:
            bind.execute(
                sa.text("UPDATE notes SET folder_id = :folder_id WHERE id = :id"),
                {"folder_id": folder_id, "id": note_id},
            )

    op.create_table(
        "transcripts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column(
            "note_id",
            sa.String(36),
            sa.ForeignKey("notes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "audio_clip_id",
            sa.String(36),
            sa.ForeignKey("audio_clips.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("language", sa.String(20), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column(
            "created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(
        "idx_transcripts_user_note", "transcripts", ["user_id", "note_id"]
    )
    op.create_index(
        "idx_transcripts_audio_clip", "transcripts", ["audio_clip_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_transcripts_audio_clip", table_name="transcripts")
    op.drop_index("idx_transcripts_user_note", table_name="transcripts")
    op.drop_table("transcripts")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_constraint("fk_notes_folder_id", "notes", type_="foreignkey")

    op.drop_index("idx_notes_user_folder_id", table_name="notes")
    with op.batch_alter_table("notes") as batch_op:
        batch_op.drop_column("folder_id")

    op.drop_index("idx_folders_user_path", table_name="folders")
    op.drop_table("folders")
