"""add note summary and transcription languages

Revision ID: 015117b1f60d
Revises: h8i9j0k1l2m3
Create Date: 2026-10-30 13:45:43.733204

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '015117b1f60d'
down_revision: Union[str, Sequence[str], None] = 'h8i9j0k1l2m3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("notes", sa.Column("summary", sa.Text(), nullable=True))
    op.add_column(
        "user_settings",
        sa.Column("transcription_languages", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("user_settings", "transcription_languages")
    op.drop_column("notes", "summary")
