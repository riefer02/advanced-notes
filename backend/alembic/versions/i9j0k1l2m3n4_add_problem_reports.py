"""add problem reports

Revision ID: i9j0k1l2m3n4
Revises: 015117b1f60d
Create Date: 2026-11-10 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i9j0k1l2m3n4"
down_revision: Union[str, None] = "015117b1f60d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "problem_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("page", sa.String(500), nullable=True),
        sa.Column("contact_email", sa.String(320), nullable=True),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="new"),
        sa.Column("notified_at", sa.TIMESTAMP(), nullable=True),
        sa.Column(
            "created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("idx_problem_reports_user_id", "problem_reports", ["user_id"])
    op.create_index(
        "idx_problem_reports_status_created",
        "problem_reports",
        ["status", "created_at"],
    )
    op.create_index("idx_problem_reports_created", "problem_reports", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_problem_reports_created", table_name="problem_reports")
    op.drop_index(
        "idx_problem_reports_status_created", table_name="problem_reports"
    )
    op.drop_index("idx_problem_reports_user_id", table_name="problem_reports")
    op.drop_table("problem_reports")
