"""add username and avatar_storage_key to user_profiles

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-02-08 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6g7h8i9j0k1'
down_revision: Union[str, None] = 'e5f6g7h8i9j0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column('username', sa.String(30), nullable=True))
    op.add_column('user_profiles', sa.Column('avatar_storage_key', sa.String(512), nullable=True))
    op.create_index('idx_user_profiles_username', 'user_profiles', ['username'], unique=True)


def downgrade() -> None:
    op.drop_index('idx_user_profiles_username', table_name='user_profiles')
    op.drop_column('user_profiles', 'avatar_storage_key')
    op.drop_column('user_profiles', 'username')
