"""add note embeddings

Revision ID: 025497cfb4da
Revises: 53f5fe358d4b
Create Date: 2025-12-12 17:14:17.275485

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '025497cfb4da'
down_revision: Union[str, Sequence[str], None] = '53f5fe358d4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


class _Vector(sa.types.UserDefinedType):
    def __init__(self, dims: int):
        self.dims = dims

    def get_col_spec(self, **kw):
        return f"vector({self.dims})"


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
        embedding_type = _Vector(1536)
    else:
        embedding_type = sa.Text()

    op.create_table(
        "note_embeddings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("note_id", sa.String(length=36), nullable=False),
        sa.Column("embedding_model", sa.String(length=100), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("embedding", embedding_type, nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "note_id", "embedding_model", name="uq_note_embeddings_user_note_model"),
    )

    op.create_index("idx_note_embeddings_user_note", "note_embeddings", ["user_id", "note_id"])
    op.create_index("idx_note_embeddings_user_model", "note_embeddings", ["user_id", "embedding_model"])
    op.create_index("idx_note_embeddings_user_updated", "note_embeddings", ["user_id", "updated_at"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("idx_note_embeddings_user_updated", table_name="note_embeddings")
    op.drop_index("idx_note_embeddings_user_model", table_name="note_embeddings")
    op.drop_index("idx_note_embeddings_user_note", table_name="note_embeddings")
    op.drop_table("note_embeddings")
