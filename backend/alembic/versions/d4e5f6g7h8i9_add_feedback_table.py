"""add_feedback_table

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-01-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6g7h8i9'
down_revision: Union[str, None] = 'c3d4e5f6g7h8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'feedback',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(255), nullable=False, index=True),
        sa.Column('feedback_type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('rating', sa.Integer(), nullable=True),
        sa.Column('email_sent', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_feedback_user_id', 'feedback', ['user_id'])
    op.create_index('idx_feedback_created', 'feedback', ['created_at'])


def downgrade() -> None:
    op.drop_index('idx_feedback_created', table_name='feedback')
    op.drop_index('idx_feedback_user_id', table_name='feedback')
    op.drop_table('feedback')
