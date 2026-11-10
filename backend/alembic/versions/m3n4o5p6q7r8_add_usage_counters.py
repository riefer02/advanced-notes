"""add usage counters

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-11-10 14:00:00.000000

Backfills monthly counters from the existing token_usage audit log so quota
checks do not need to scan the whole table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m3n4o5p6q7r8"
down_revision: Union[str, None] = "l2m3n4o5p6q7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "usage_counters",
        sa.Column("user_id", sa.String(255), primary_key=True),
        sa.Column("period_start", sa.Date(), primary_key=True),
        sa.Column("service_type", sa.String(50), primary_key=True),
        sa.Column("units", sa.Float(), nullable=False, server_default="0"),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(
        "idx_usage_counters_user_period",
        "usage_counters",
        ["user_id", "period_start"],
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("SET LOCAL TimeZone = 'UTC'")
        op.execute(
            """
            INSERT INTO usage_counters
                (user_id, period_start, service_type, units,
                 estimated_cost_usd, updated_at)
            SELECT
                user_id,
                date_trunc('month', created_at AT TIME ZONE 'UTC')::date,
                service_type,
                CASE WHEN service_type = 'transcription'
                     THEN COALESCE(SUM(audio_duration_seconds), 0) / 60.0
                     ELSE COUNT(*) END,
                COALESCE(SUM(estimated_cost_usd), 0),
                CURRENT_TIMESTAMP
            FROM token_usage
            GROUP BY
                user_id,
                date_trunc('month', created_at AT TIME ZONE 'UTC')::date,
                service_type
            ON CONFLICT (user_id, period_start, service_type) DO NOTHING
            """
        )
    else:
        op.execute(
            """
            INSERT OR IGNORE INTO usage_counters
                (user_id, period_start, service_type, units,
                 estimated_cost_usd, updated_at)
            SELECT
                user_id,
                date(created_at, 'start of month'),
                service_type,
                CASE WHEN service_type = 'transcription'
                     THEN COALESCE(SUM(audio_duration_seconds), 0) / 60.0
                     ELSE COUNT(*) END,
                COALESCE(SUM(estimated_cost_usd), 0),
                CURRENT_TIMESTAMP
            FROM token_usage
            GROUP BY user_id, date(created_at, 'start of month'), service_type
            """
        )


def downgrade() -> None:
    op.drop_index("idx_usage_counters_user_period", table_name="usage_counters")
    op.drop_table("usage_counters")
