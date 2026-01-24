"""Add usage tracking tables

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-01-24 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6g7h8"
down_revision: Union[str, None] = "b2c3d4e5f6g7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create token_usage table
    op.create_table(
        "token_usage",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("service_type", sa.String(50), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("prompt_tokens", sa.Integer, nullable=True),
        sa.Column("completion_tokens", sa.Integer, nullable=True),
        sa.Column("total_tokens", sa.Integer, nullable=True),
        sa.Column("audio_duration_seconds", sa.Float, nullable=True),
        sa.Column("endpoint", sa.String(100), nullable=True),
        sa.Column("estimated_cost_usd", sa.Float, nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP,
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("idx_token_usage_user_id", "token_usage", ["user_id"])
    op.create_index("idx_token_usage_user_created", "token_usage", ["user_id", "created_at"])
    op.create_index("idx_token_usage_user_service", "token_usage", ["user_id", "service_type"])

    # Create usage_quotas table
    op.create_table(
        "usage_quotas",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=False, unique=True),
        sa.Column("tier", sa.String(50), nullable=False, server_default="free"),
        sa.Column(
            "transcription_minutes_limit",
            sa.Integer,
            nullable=False,
            server_default="100",
        ),
        sa.Column(
            "ai_calls_limit",
            sa.Integer,
            nullable=False,
            server_default="500",
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP,
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("idx_usage_quotas_user_id", "usage_quotas", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_usage_quotas_user_id", table_name="usage_quotas")
    op.drop_table("usage_quotas")

    op.drop_index("idx_token_usage_user_service", table_name="token_usage")
    op.drop_index("idx_token_usage_user_created", table_name="token_usage")
    op.drop_index("idx_token_usage_user_id", table_name="token_usage")
    op.drop_table("token_usage")
