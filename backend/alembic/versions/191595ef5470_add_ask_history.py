"""add ask history

Revision ID: 191595ef5470
Revises: 025497cfb4da
Create Date: 2025-12-12 17:49:29.259197

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '191595ef5470'
down_revision: Union[str, Sequence[str], None] = '025497cfb4da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "ask_history",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("query_plan_json", sa.Text(), nullable=False),
        sa.Column("answer_markdown", sa.Text(), nullable=False),
        sa.Column("cited_note_ids_json", sa.Text(), nullable=False),
        sa.Column("source_scores_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("idx_ask_history_user_id", "ask_history", ["user_id"])
    op.create_index(
        "idx_ask_history_user_created", "ask_history", ["user_id", "created_at"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("idx_ask_history_user_created", table_name="ask_history")
    op.drop_index("idx_ask_history_user_id", table_name="ask_history")
    op.drop_table("ask_history")
