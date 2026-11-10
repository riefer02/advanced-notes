"""phase 4 search index and embedding ANN

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-11-10 13:00:00.000000

Postgres-only:
- notes.search_vector (generated STORED) + GIN index
- note_embeddings HNSW cosine index

SQLite keeps using FTS5 and stores embeddings as JSON text, so this migration
is a no-op there.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "l2m3n4o5p6q7"
down_revision: Union[str, None] = "k1l2m3n4o5p6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_SEARCH_EXPRESSION = (
    "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || "
    "setweight(to_tsvector('simple', coalesce(summary, '')), 'B') || "
    "setweight(to_tsvector('simple', coalesce(content, '')), 'C') || "
    "setweight(to_tsvector('simple', coalesce(tags::text, '')), 'D')"
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # A stored generated column rewrites the table; fail fast instead of
    # queueing behind a long lock. The table is small at current scale.
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "notes",
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(_SEARCH_EXPRESSION, persisted=True),
        ),
    )
    op.create_index(
        "ix_notes_search_vector",
        "notes",
        ["search_vector"],
        postgresql_using="gin",
    )

    # pgvector >= 0.8 is required in production for iterative scans. HNSW is
    # safe to build on an empty/small table and needs no training.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_note_embeddings_hnsw "
        "ON note_embeddings USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("DROP INDEX IF EXISTS ix_note_embeddings_hnsw")
    op.drop_index("ix_notes_search_vector", table_name="notes")
    op.drop_column("notes", "search_vector")
