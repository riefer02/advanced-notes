"""Add user_id for user isolation to existing notes

Revision ID: 1ec4c0eb879f
Revises: 
Create Date: 2025-11-11 09:39:40.508294

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1ec4c0eb879f'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add user_id column for user isolation.
    
    Handles both scenarios:
    - New database: Creates table with user_id
    - Existing database: Adds user_id column to existing table
    """
    from sqlalchemy import inspect
    
    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()
    
    if 'notes' not in tables:
        # Fresh database - create table with user_id from the start
        op.create_table('notes',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('user_id', sa.String(length=255), nullable=False),
            sa.Column('title', sa.Text(), nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('folder_path', sa.Text(), nullable=False),
            sa.Column('tags', sa.Text(), nullable=True),
            sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
            sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
            sa.Column('word_count', sa.Integer(), nullable=True),
            sa.Column('confidence', sa.Float(), nullable=True),
            sa.Column('transcription_duration', sa.Float(), nullable=True),
            sa.Column('model_version', sa.String(length=50), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
    else:
        # Existing database (production) - add user_id column to existing table
        columns = [c['name'] for c in inspector.get_columns('notes')]
        
        if 'user_id' not in columns:
            # Add user_id column (NOT NULL with default for any existing rows)
            with op.batch_alter_table('notes', schema=None) as batch_op:
                batch_op.add_column(
                    sa.Column('user_id', sa.String(length=255), nullable=False, server_default='unknown')
                )
                # Remove server default after column is added
                batch_op.alter_column('user_id', server_default=None)
    
    # Create indexes for efficient user-scoped queries
    # Check if indexes exist to avoid errors
    existing_indexes = [idx['name'] for idx in inspector.get_indexes('notes')]
    
    if 'idx_notes_user_id' not in existing_indexes:
        op.create_index('idx_notes_user_id', 'notes', ['user_id'], unique=False)
    if 'idx_notes_user_folder' not in existing_indexes:
        op.create_index('idx_notes_user_folder', 'notes', ['user_id', 'folder_path'], unique=False)
    if 'idx_notes_user_created' not in existing_indexes:
        op.create_index('idx_notes_user_created', 'notes', ['user_id', 'created_at'], unique=False)
    if 'idx_notes_user_updated' not in existing_indexes:
        op.create_index('idx_notes_user_updated', 'notes', ['user_id', 'updated_at'], unique=False)


def downgrade() -> None:
    """
    Remove user_id column.
    
    WARNING: This will lose user isolation. All notes will become global.
    """
    # Drop user-specific indexes
    with op.batch_alter_table('notes', schema=None) as batch_op:
        try:
            batch_op.drop_index('idx_notes_user_updated')
        except:
            pass
        try:
            batch_op.drop_index('idx_notes_user_folder')
        except:
            pass
        try:
            batch_op.drop_index('idx_notes_user_created')
        except:
            pass
        try:
            batch_op.drop_index('idx_notes_user_id')
        except:
            pass
        
        # Remove user_id column
        batch_op.drop_column('user_id')
