"""reconcile meal/vinyl embedding types and indexes

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-11-10 18:00:00.000000

The original meal/vinyl migrations created `embedding` as TEXT on every
dialect while the ORM declares VectorEmbedding(1536). On Postgres this
migration converts the columns to pgvector, dedupes, adds unique constraints,
and adds HNSW cosine indexes. SQLite keeps JSON text.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "q7r8s9t0u1v2"
down_revision: Union[str, None] = "p6q7r8s9t0u1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute(
        "ALTER TABLE meal_embeddings "
        "ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector"
    )
    op.execute(
        "ALTER TABLE vinyl_embeddings "
        "ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector"
    )

    op.execute(
        """
        DELETE FROM meal_embeddings a
        USING meal_embeddings b
        WHERE a.user_id = b.user_id
          AND a.meal_entry_id = b.meal_entry_id
          AND a.embedding_model = b.embedding_model
          AND a.id > b.id
        """
    )
    op.execute(
        """
        DELETE FROM vinyl_embeddings a
        USING vinyl_embeddings b
        WHERE a.user_id = b.user_id
          AND a.vinyl_record_id = b.vinyl_record_id
          AND a.embedding_model = b.embedding_model
          AND a.id > b.id
        """
    )

    op.execute(
        "ALTER TABLE meal_embeddings ADD CONSTRAINT "
        "uq_meal_embeddings_user_meal_model "
        "UNIQUE (user_id, meal_entry_id, embedding_model)"
    )
    op.execute(
        "ALTER TABLE vinyl_embeddings ADD CONSTRAINT "
        "uq_vinyl_embeddings_user_record_model "
        "UNIQUE (user_id, vinyl_record_id, embedding_model)"
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_meal_embeddings_hnsw "
        "ON meal_embeddings USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_vinyl_embeddings_hnsw "
        "ON vinyl_embeddings USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("DROP INDEX IF EXISTS ix_vinyl_embeddings_hnsw")
    op.execute("DROP INDEX IF EXISTS ix_meal_embeddings_hnsw")
    op.execute(
        "ALTER TABLE vinyl_embeddings DROP CONSTRAINT "
        "uq_vinyl_embeddings_user_record_model"
    )
    op.execute(
        "ALTER TABLE meal_embeddings DROP CONSTRAINT "
        "uq_meal_embeddings_user_meal_model"
    )
    op.execute(
        "ALTER TABLE vinyl_embeddings "
        "ALTER COLUMN embedding TYPE text USING embedding::text"
    )
    op.execute(
        "ALTER TABLE meal_embeddings "
        "ALTER COLUMN embedding TYPE text USING embedding::text"
    )
