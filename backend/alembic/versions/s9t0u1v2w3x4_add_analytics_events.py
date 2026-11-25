"""add analytics events

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-11-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "s9t0u1v2w3x4"
down_revision: Union[str, None] = "r8s9t0u1v2w3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "analytics_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("properties_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_analytics_events_user_id",
        "analytics_events",
        ["user_id"],
    )
    op.create_index(
        "idx_analytics_events_user_created",
        "analytics_events",
        ["user_id", "created_at"],
    )
    op.create_index(
        "idx_analytics_events_name_created",
        "analytics_events",
        ["name", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_analytics_events_name_created", table_name="analytics_events")
    op.drop_index("idx_analytics_events_user_created", table_name="analytics_events")
    op.drop_index("ix_analytics_events_user_id", table_name="analytics_events")
    op.drop_table("analytics_events")
