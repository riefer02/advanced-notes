"""add ops events and service heartbeats

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-11-10 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j0k1l2m3n4o5"
down_revision: Union[str, None] = "i9j0k1l2m3n4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "service_heartbeats",
        sa.Column("name", sa.String(64), primary_key=True),
        sa.Column("last_seen_at", sa.TIMESTAMP(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
    )

    op.create_table(
        "ops_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "created_at", sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("environment", sa.String(50), nullable=True),
        sa.Column("release", sa.String(100), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("method", sa.String(10), nullable=True),
        sa.Column("route", sa.String(255), nullable=True),
        sa.Column("path", sa.String(500), nullable=True),
        sa.Column("status", sa.Integer(), nullable=False, server_default="500"),
        sa.Column("error_type", sa.String(100), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("traceback", sa.Text(), nullable=True),
        sa.Column("user_id", sa.String(255), nullable=True),
        sa.Column("fingerprint", sa.String(255), nullable=False),
    )
    op.create_index("idx_ops_events_created", "ops_events", ["created_at"])
    op.create_index(
        "idx_ops_events_fingerprint_created",
        "ops_events",
        ["fingerprint", "created_at"],
    )
    op.create_index(
        "idx_ops_events_status_created", "ops_events", ["status", "created_at"]
    )

    # Reclaim support for the email outbox: a worker crash after claiming a
    # row otherwise leaves it in "sending" forever.
    op.add_column(
        "email_outbox", sa.Column("claimed_at", sa.TIMESTAMP(), nullable=True)
    )


def downgrade() -> None:
    with op.batch_alter_table("email_outbox") as batch_op:
        batch_op.drop_column("claimed_at")
    op.drop_index("idx_ops_events_status_created", table_name="ops_events")
    op.drop_index("idx_ops_events_fingerprint_created", table_name="ops_events")
    op.drop_index("idx_ops_events_created", table_name="ops_events")
    op.drop_table("ops_events")
    op.drop_table("service_heartbeats")
