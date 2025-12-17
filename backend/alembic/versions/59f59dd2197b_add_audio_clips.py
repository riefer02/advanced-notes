"""add audio clips

Revision ID: 59f59dd2197b
Revises: 191595ef5470
Create Date: 2025-12-17 15:50:31.284336

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '59f59dd2197b'
down_revision: Union[str, Sequence[str], None] = '191595ef5470'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "audio_clips",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("note_id", sa.String(length=36), nullable=True),
        sa.Column("bucket", sa.String(length=255), nullable=True),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("bytes", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
    )

    op.create_index("idx_audio_clips_user_id", "audio_clips", ["user_id"])
    op.create_index("idx_audio_clips_user_note", "audio_clips", ["user_id", "note_id"])
    op.create_index(
        "idx_audio_clips_user_created", "audio_clips", ["user_id", "created_at"]
    )
    # Optional single-column indexes for fast lookup/filtering.
    op.create_index("ix_audio_clips_note_id", "audio_clips", ["note_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_audio_clips_note_id", table_name="audio_clips")
    op.drop_index("idx_audio_clips_user_created", table_name="audio_clips")
    op.drop_index("idx_audio_clips_user_note", table_name="audio_clips")
    op.drop_index("idx_audio_clips_user_id", table_name="audio_clips")
    op.drop_table("audio_clips")
