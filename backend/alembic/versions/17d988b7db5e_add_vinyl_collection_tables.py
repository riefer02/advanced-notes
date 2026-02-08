"""add vinyl collection tables

Revision ID: 17d988b7db5e
Revises: d4e5f6g7h8i9
Create Date: 2026-02-08 09:15:22.899426

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '17d988b7db5e'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6g7h8i9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('vinyl_records',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.String(length=255), nullable=False),
    sa.Column('artist', sa.String(length=500), nullable=False),
    sa.Column('album_title', sa.String(length=500), nullable=False),
    sa.Column('release_year', sa.Integer(), nullable=True),
    sa.Column('genre', sa.Text(), nullable=True),
    sa.Column('label', sa.String(length=255), nullable=True),
    sa.Column('catalog_number', sa.String(length=100), nullable=True),
    sa.Column('format', sa.String(length=50), nullable=True),
    sa.Column('pressing_country', sa.String(length=100), nullable=True),
    sa.Column('color', sa.String(length=100), nullable=True),
    sa.Column('condition', sa.String(length=50), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('extraction_status', sa.String(length=20), server_default='manual', nullable=False),
    sa.Column('extraction_confidence', sa.Float(), nullable=True),
    sa.Column('cover_image_id', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_vinyl_records_user_id', 'vinyl_records', ['user_id'], unique=False)
    op.create_index('idx_vinyl_records_user_artist', 'vinyl_records', ['user_id', 'artist'], unique=False)
    op.create_index('idx_vinyl_records_user_created', 'vinyl_records', ['user_id', 'created_at'], unique=False)

    op.create_table('vinyl_images',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.String(length=255), nullable=False),
    sa.Column('vinyl_record_id', sa.String(length=36), nullable=False),
    sa.Column('image_type', sa.String(length=50), nullable=False),
    sa.Column('storage_key', sa.Text(), nullable=False),
    sa.Column('mime_type', sa.String(length=100), nullable=False),
    sa.Column('bytes', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=20), server_default='pending', nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['vinyl_record_id'], ['vinyl_records.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_vinyl_images_user_id', 'vinyl_images', ['user_id'], unique=False)
    op.create_index('idx_vinyl_images_record', 'vinyl_images', ['vinyl_record_id'], unique=False)

    op.create_table('vinyl_tracks',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.String(length=255), nullable=False),
    sa.Column('vinyl_record_id', sa.String(length=36), nullable=False),
    sa.Column('side', sa.String(length=10), nullable=True),
    sa.Column('position', sa.Integer(), nullable=True),
    sa.Column('title', sa.String(length=500), nullable=False),
    sa.Column('duration', sa.String(length=20), nullable=True),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['vinyl_record_id'], ['vinyl_records.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_vinyl_tracks_user_id', 'vinyl_tracks', ['user_id'], unique=False)
    op.create_index('idx_vinyl_tracks_record', 'vinyl_tracks', ['vinyl_record_id'], unique=False)

    op.create_table('vinyl_embeddings',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.String(length=255), nullable=False),
    sa.Column('vinyl_record_id', sa.String(length=36), nullable=False),
    sa.Column('embedding_model', sa.String(length=100), nullable=False),
    sa.Column('content_hash', sa.String(length=64), nullable=False),
    sa.Column('embedding', sa.Text(), nullable=False),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_vinyl_embeddings_user_record', 'vinyl_embeddings', ['user_id', 'vinyl_record_id'], unique=False)
    op.create_index('idx_vinyl_embeddings_user_model', 'vinyl_embeddings', ['user_id', 'embedding_model'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('vinyl_embeddings')
    op.drop_table('vinyl_tracks')
    op.drop_table('vinyl_images')
    op.drop_table('vinyl_records')
