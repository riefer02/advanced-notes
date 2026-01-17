"""add user_settings and todos tables

Revision ID: a1b2c3d4e5f6
Revises: 59f59dd2197b
Create Date: 2026-01-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '59f59dd2197b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create user_settings table
    op.create_table(
        "user_settings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=255), nullable=False, unique=True),
        sa.Column("auto_accept_todos", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_user_settings_user_id", "user_settings", ["user_id"])

    # Create todos table
    op.create_table(
        "todos",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("note_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="suggested"),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("extraction_context", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.TIMESTAMP(), nullable=True),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="SET NULL"),
    )
    op.create_index("idx_todos_user_id", "todos", ["user_id"])
    op.create_index("idx_todos_user_status", "todos", ["user_id", "status"])
    op.create_index("idx_todos_user_note", "todos", ["user_id", "note_id"])
    op.create_index("idx_todos_user_created", "todos", ["user_id", "created_at"])
    op.create_index("ix_todos_note_id", "todos", ["note_id"])


def downgrade() -> None:
    """Downgrade schema."""
    # Drop todos table
    op.drop_index("ix_todos_note_id", table_name="todos")
    op.drop_index("idx_todos_user_created", table_name="todos")
    op.drop_index("idx_todos_user_note", table_name="todos")
    op.drop_index("idx_todos_user_status", table_name="todos")
    op.drop_index("idx_todos_user_id", table_name="todos")
    op.drop_table("todos")

    # Drop user_settings table
    op.drop_index("idx_user_settings_user_id", table_name="user_settings")
    op.drop_table("user_settings")
