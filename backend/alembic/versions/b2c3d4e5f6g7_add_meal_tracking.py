"""add meal_tracking tables

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-01-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6g7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create meal_entries table
    op.create_table(
        "meal_entries",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("meal_type", sa.String(length=20), nullable=False),
        sa.Column("meal_date", sa.Date(), nullable=False),
        sa.Column("meal_time", sa.Time(), nullable=True),
        sa.Column("transcription", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("transcription_duration", sa.Float(), nullable=True),
        sa.Column("model_version", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_meal_entries_user_id", "meal_entries", ["user_id"])
    op.create_index("idx_meal_entries_user_date", "meal_entries", ["user_id", "meal_date"])
    op.create_index("idx_meal_entries_user_type", "meal_entries", ["user_id", "meal_type"])
    op.create_index("idx_meal_entries_user_created", "meal_entries", ["user_id", "created_at"])
    op.create_index("ix_meal_entries_meal_date", "meal_entries", ["meal_date"])

    # Create meal_items table
    op.create_table(
        "meal_items",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("meal_entry_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("portion", sa.String(length=100), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["meal_entry_id"], ["meal_entries.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_meal_items_user_id", "meal_items", ["user_id"])
    op.create_index("idx_meal_items_meal_entry", "meal_items", ["meal_entry_id"])

    # Create meal_embeddings table
    op.create_table(
        "meal_embeddings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("meal_entry_id", sa.String(length=36), nullable=False),
        sa.Column("embedding_model", sa.String(length=100), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("embedding", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_meal_embeddings_user_meal", "meal_embeddings", ["user_id", "meal_entry_id"])
    op.create_index("idx_meal_embeddings_user_model", "meal_embeddings", ["user_id", "embedding_model"])


def downgrade() -> None:
    """Downgrade schema."""
    # Drop meal_embeddings table
    op.drop_index("idx_meal_embeddings_user_model", table_name="meal_embeddings")
    op.drop_index("idx_meal_embeddings_user_meal", table_name="meal_embeddings")
    op.drop_table("meal_embeddings")

    # Drop meal_items table
    op.drop_index("idx_meal_items_meal_entry", table_name="meal_items")
    op.drop_index("idx_meal_items_user_id", table_name="meal_items")
    op.drop_table("meal_items")

    # Drop meal_entries table
    op.drop_index("ix_meal_entries_meal_date", table_name="meal_entries")
    op.drop_index("idx_meal_entries_user_created", table_name="meal_entries")
    op.drop_index("idx_meal_entries_user_type", table_name="meal_entries")
    op.drop_index("idx_meal_entries_user_date", table_name="meal_entries")
    op.drop_index("idx_meal_entries_user_id", table_name="meal_entries")
    op.drop_table("meal_entries")
