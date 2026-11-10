"""sharing hardening: unordered friend pairs and per-resource shares

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-11-10 15:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n4o5p6q7r8s9"
down_revision: Union[str, None] = "m3n4o5p6q7r8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # --- friendships: normalized unordered pair ---
    op.add_column(
        "friendships",
        sa.Column("pair_key", sa.String(512), nullable=False, server_default=""),
    )
    op.execute(
        """
        UPDATE friendships
        SET pair_key = CASE
            WHEN requester_id < addressee_id
                THEN requester_id || '|' || addressee_id
            ELSE addressee_id || '|' || requester_id
        END
        """
    )
    # Collapse reverse-direction duplicates before enforcing uniqueness.
    if dialect == "postgresql":
        op.execute(
            """
            DELETE FROM friendships a
            USING friendships b
            WHERE a.pair_key = b.pair_key AND a.id > b.id
            """
        )
    else:
        op.execute(
            """
            DELETE FROM friendships
            WHERE id NOT IN (SELECT MIN(id) FROM friendships GROUP BY pair_key)
            """
        )
    op.create_index(
        "idx_friendships_pair_key", "friendships", ["pair_key"], unique=True
    )

    # --- resource shares: optional per-resource grants ---
    op.add_column(
        "resource_shares", sa.Column("resource_id", sa.String(36), nullable=True)
    )
    op.add_column(
        "resource_shares",
        sa.Column("resource_key", sa.String(64), nullable=False, server_default=""),
    )
    op.execute("UPDATE resource_shares SET resource_key = '' WHERE resource_key IS NULL")

    op.drop_index("idx_resource_shares_unique", table_name="resource_shares")
    op.create_index(
        "idx_resource_shares_unique",
        "resource_shares",
        ["owner_id", "shared_with_id", "resource_type", "resource_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("idx_resource_shares_unique", table_name="resource_shares")
    op.create_index(
        "idx_resource_shares_unique",
        "resource_shares",
        ["owner_id", "shared_with_id", "resource_type"],
        unique=True,
    )
    with op.batch_alter_table("resource_shares") as batch_op:
        batch_op.drop_column("resource_key")
        batch_op.drop_column("resource_id")

    op.drop_index("idx_friendships_pair_key", table_name="friendships")
    with op.batch_alter_table("friendships") as batch_op:
        batch_op.drop_column("pair_key")
