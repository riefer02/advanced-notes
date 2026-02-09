"""add sharing tables (user_profiles, friendships, resource_shares)

Revision ID: e5f6g7h8i9j0
Revises: 17d988b7db5e
Create Date: 2026-02-08 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6g7h8i9j0'
down_revision: Union[str, None] = '17d988b7db5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # user_profiles
    op.create_table(
        'user_profiles',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(255), nullable=False, unique=True),
        sa.Column('display_name', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('avatar_url', sa.Text(), nullable=True),
        sa.Column('bio', sa.Text(), nullable=True),
        sa.Column('discoverable', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_user_profiles_user_id', 'user_profiles', ['user_id'], unique=True)
    op.create_index('idx_user_profiles_email', 'user_profiles', ['email'])
    op.create_index('idx_user_profiles_display_name', 'user_profiles', ['display_name'])

    # friendships
    op.create_table(
        'friendships',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('requester_id', sa.String(255), nullable=False),
        sa.Column('addressee_id', sa.String(255), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_friendships_requester', 'friendships', ['requester_id'])
    op.create_index('idx_friendships_addressee', 'friendships', ['addressee_id'])
    op.create_index('idx_friendships_pair', 'friendships', ['requester_id', 'addressee_id'], unique=True)
    op.create_index('idx_friendships_addressee_status', 'friendships', ['addressee_id', 'status'])

    # resource_shares
    op.create_table(
        'resource_shares',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('owner_id', sa.String(255), nullable=False),
        sa.Column('shared_with_id', sa.String(255), nullable=False),
        sa.Column('resource_type', sa.String(50), nullable=False),
        sa.Column('permission', sa.String(20), nullable=False, server_default='view'),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_resource_shares_owner', 'resource_shares', ['owner_id'])
    op.create_index('idx_resource_shares_shared_with', 'resource_shares', ['shared_with_id'])
    op.create_index('idx_resource_shares_unique', 'resource_shares', ['owner_id', 'shared_with_id', 'resource_type'], unique=True)
    op.create_index('idx_resource_shares_recipient_status', 'resource_shares', ['shared_with_id', 'status'])


def downgrade() -> None:
    op.drop_table('resource_shares')
    op.drop_table('friendships')
    op.drop_table('user_profiles')
