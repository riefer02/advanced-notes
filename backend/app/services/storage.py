"""
Storage service for notes (database-only).

Uses SQLite with FTS5 for full-text search.
All content stored in database, no file system dependencies.
"""

import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict
from contextlib import contextmanager

from .models import Note, NoteMetadata, NoteListItem, FolderNode, FolderStats, SearchResult


class NoteStorage:
    """
    Database-only storage for notes.
    
    Features:
    - SQLite with WAL mode for concurrent access
    - FTS5 full-text search
    - Transaction safety
    - Automatic schema initialization
    """
    
    def __init__(self, db_path: str = "backend/notes/.notes.db"):
        """
        Initialize storage with database path.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Initialize database
        self._init_database()
        
    @contextmanager
    def _get_connection(self):
        """Get database connection with automatic commit/rollback"""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row  # Enable dict-like access
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    
    def _init_database(self):
        """Initialize database schema if not exists"""
        with self._get_connection() as conn:
            # Enable WAL mode for better concurrency
            conn.execute("PRAGMA journal_mode=WAL")
            
            # Main notes table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS notes (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    folder_path TEXT NOT NULL,
                    tags TEXT,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL,
                    word_count INTEGER DEFAULT 0,
                    confidence REAL,
                    transcription_duration REAL,
                    model_version TEXT
                )
            """)
            
            # Indexes for common queries
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_notes_folder 
                ON notes(folder_path)
            """)
            
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_notes_created 
                ON notes(created_at DESC)
            """)
            
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_notes_updated 
                ON notes(updated_at DESC)
            """)
            
            # FTS5 virtual table for full-text search
            conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                    note_id UNINDEXED,
                    title,
                    content,
                    tags
                )
            """)
            
            # Triggers to keep FTS index in sync
            conn.execute("""
                CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
                    INSERT INTO notes_fts(note_id, title, content, tags)
                    VALUES (new.id, new.title, new.content, new.tags);
                END
            """)
            
            conn.execute("""
                CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
                    UPDATE notes_fts SET 
                        note_id = new.id,
                        title = new.title, 
                        content = new.content, 
                        tags = new.tags
                    WHERE note_id = old.id;
                END
            """)
            
            conn.execute("""
                CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
                    DELETE FROM notes_fts WHERE note_id = old.id;
                END
            """)
    
    def save_note(self, content: str, metadata: NoteMetadata) -> str:
        """
        Save a new note to the database.
        
        Args:
            content: Full markdown content
            metadata: Note metadata
            
        Returns:
            Note ID (UUID)
        """
        note = Note(
            title=metadata.title,
            content=content,
            folder_path=metadata.folder_path,
            tags=metadata.tags,
            word_count=len(content.split()),
            confidence=metadata.confidence,
            transcription_duration=metadata.transcription_duration,
            model_version=metadata.model_version
        )
        
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO notes (
                    id, title, content, folder_path, tags,
                    created_at, updated_at, word_count, confidence,
                    transcription_duration, model_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                note.id,
                note.title,
                note.content,
                note.folder_path,
                json.dumps(note.tags),
                note.created_at.isoformat(),
                note.updated_at.isoformat(),
                note.word_count,
                note.confidence,
                note.transcription_duration,
                note.model_version
            ))
        
        return note.id
    
    def get_note(self, note_id: str) -> Optional[Note]:
        """
        Retrieve a note by ID.
        
        Args:
            note_id: Note UUID
            
        Returns:
            Note object or None if not found
        """
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM notes WHERE id = ?",
                (note_id,)
            ).fetchone()
            
            if not row:
                return None
            
            return self._row_to_note(row)
    
    def update_note(
        self,
        note_id: str,
        content: Optional[str] = None,
        metadata: Optional[NoteMetadata] = None
    ) -> bool:
        """
        Update an existing note.
        
        Args:
            note_id: Note UUID
            content: New content (optional)
            metadata: New metadata (optional)
            
        Returns:
            True if updated, False if not found
        """
        # Get existing note
        existing = self.get_note(note_id)
        if not existing:
            return False
        
        # Prepare updates
        updates = {"updated_at": datetime.now().isoformat()}
        
        if content is not None:
            updates["content"] = content
            updates["word_count"] = len(content.split())
        
        if metadata:
            if metadata.title:
                updates["title"] = metadata.title
            if metadata.folder_path:
                updates["folder_path"] = metadata.folder_path
            if metadata.tags:
                updates["tags"] = json.dumps(metadata.tags)
            if metadata.confidence is not None:
                updates["confidence"] = metadata.confidence
        
        # Build UPDATE query
        set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
        values = list(updates.values()) + [note_id]
        
        with self._get_connection() as conn:
            conn.execute(
                f"UPDATE notes SET {set_clause} WHERE id = ?",
                values
            )
        
        return True
    
    def delete_note(self, note_id: str) -> bool:
        """
        Delete a note.
        
        Args:
            note_id: Note UUID
            
        Returns:
            True if deleted, False if not found
        """
        with self._get_connection() as conn:
            cursor = conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
            return cursor.rowcount > 0
    
    def list_notes(
        self,
        folder: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        order_by: str = "updated_at"
    ) -> List[NoteListItem]:
        """
        List notes with optional filtering.
        
        Args:
            folder: Filter by folder path (optional)
            limit: Maximum number of results
            offset: Pagination offset
            order_by: Sort field (created_at, updated_at, title)
            
        Returns:
            List of NoteListItem objects
        """
        query = """
            SELECT id, title, folder_path, tags, created_at, updated_at, 
                   word_count, confidence
            FROM notes
        """
        params = []
        
        if folder:
            query += " WHERE folder_path = ? OR folder_path LIKE ?"
            params.extend([folder, f"{folder}/%"])
        
        query += f" ORDER BY {order_by} DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_list_item(row) for row in rows]
    
    def search_notes(self, query: str, limit: int = 50) -> List[SearchResult]:
        """
        Full-text search across notes.
        
        Args:
            query: Search query
            limit: Maximum results
            
        Returns:
            List of SearchResult objects with ranking
        """
        with self._get_connection() as conn:
            # FTS5 search with ranking
            rows = conn.execute("""
                SELECT 
                    n.id, n.title, n.folder_path, n.tags, n.created_at,
                    n.updated_at, n.word_count, n.confidence,
                    rank,
                    snippet(notes_fts, 2, '<mark>', '</mark>', '...', 50) as snippet
                FROM notes_fts
                JOIN notes n ON notes_fts.note_id = n.id
                WHERE notes_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            """, (query, limit)).fetchall()
            
            results = []
            for row in rows:
                note = self._row_to_list_item(row)
                results.append(SearchResult(
                    note=note,
                    rank=abs(row['rank']),  # FTS5 rank is negative
                    snippet=row['snippet']
                ))
            
            return results
    
    def get_folder_tree(self) -> FolderNode:
        """
        Get folder hierarchy with note counts.
        
        Returns:
            Root FolderNode with nested subfolders
        """
        with self._get_connection() as conn:
            # Get all unique folder paths
            rows = conn.execute("""
                SELECT folder_path, COUNT(*) as count
                FROM notes
                GROUP BY folder_path
                ORDER BY folder_path
            """).fetchall()
            
            # Build tree structure
            root = FolderNode(name="", path="", note_count=0)
            folder_map = {"": root}
            
            for row in rows:
                path = row['folder_path']
                count = row['count']
                
                # Split path into parts
                parts = path.split('/')
                
                # Create folders for each part
                current_path = ""
                parent = root
                
                for part in parts:
                    current_path = f"{current_path}/{part}".strip('/')
                    
                    if current_path not in folder_map:
                        folder = FolderNode(
                            name=part,
                            path=current_path,
                            note_count=0
                        )
                        folder_map[current_path] = folder
                        parent.subfolders.append(folder)
                    
                    parent = folder_map[current_path]
                
                # Set note count for leaf folder
                parent.note_count = count
            
            return root
    
    def get_all_tags(self) -> List[str]:
        """
        Get all unique tags across all notes.
        
        Returns:
            Sorted list of tag names
        """
        with self._get_connection() as conn:
            rows = conn.execute("SELECT tags FROM notes WHERE tags IS NOT NULL").fetchall()
            
            tags = set()
            for row in rows:
                if row['tags']:
                    tags.update(json.loads(row['tags']))
            
            return sorted(tags)
    
    def get_notes_by_tag(self, tag: str, limit: int = 50) -> List[NoteListItem]:
        """
        Get notes that have a specific tag.
        
        Args:
            tag: Tag name
            limit: Maximum results
            
        Returns:
            List of NoteListItem objects
        """
        with self._get_connection() as conn:
            rows = conn.execute("""
                SELECT id, title, folder_path, tags, created_at, updated_at,
                       word_count, confidence
                FROM notes
                WHERE tags LIKE ?
                ORDER BY updated_at DESC
                LIMIT ?
            """, (f'%"{tag}"%', limit)).fetchall()
            
            return [self._row_to_list_item(row) for row in rows]
    
    def get_note_count(self, folder: Optional[str] = None) -> int:
        """
        Get total note count, optionally filtered by folder.
        
        Args:
            folder: Folder path (optional)
            
        Returns:
            Number of notes
        """
        with self._get_connection() as conn:
            if folder:
                result = conn.execute("""
                    SELECT COUNT(*) as count FROM notes
                    WHERE folder_path = ? OR folder_path LIKE ?
                """, (folder, f"{folder}/%")).fetchone()
            else:
                result = conn.execute("SELECT COUNT(*) as count FROM notes").fetchone()
            
            return result['count']
    
    def get_folder_stats(self, folder: str) -> Optional[FolderStats]:
        """
        Get statistics for a folder.
        
        Args:
            folder: Folder path
            
        Returns:
            FolderStats object or None
        """
        with self._get_connection() as conn:
            row = conn.execute("""
                SELECT 
                    COUNT(*) as count,
                    SUM(transcription_duration) as total_duration,
                    AVG(confidence) as avg_confidence
                FROM notes
                WHERE folder_path = ? OR folder_path LIKE ?
            """, (folder, f"{folder}/%")).fetchone()
            
            if row['count'] == 0:
                return None
            
            # Get most common tags
            tags = []
            tag_rows = conn.execute("""
                SELECT tags FROM notes
                WHERE (folder_path = ? OR folder_path LIKE ?) AND tags IS NOT NULL
            """, (folder, f"{folder}/%")).fetchall()
            
            tag_counts = {}
            for tag_row in tag_rows:
                if tag_row['tags']:
                    for tag in json.loads(tag_row['tags']):
                        tag_counts[tag] = tag_counts.get(tag, 0) + 1
            
            # Sort by count and get top 5
            most_common = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            tags = [tag for tag, _ in most_common]
            
            return FolderStats(
                path=folder,
                note_count=row['count'],
                total_duration=row['total_duration'] or 0.0,
                avg_confidence=row['avg_confidence'],
                most_common_tags=tags
            )
    
    def _row_to_note(self, row: sqlite3.Row) -> Note:
        """Convert database row to Note object"""
        return Note(
            id=row['id'],
            title=row['title'],
            content=row['content'],
            folder_path=row['folder_path'],
            tags=json.loads(row['tags']) if row['tags'] else [],
            created_at=datetime.fromisoformat(row['created_at']),
            updated_at=datetime.fromisoformat(row['updated_at']),
            word_count=row['word_count'],
            confidence=row['confidence'],
            transcription_duration=row['transcription_duration'],
            model_version=row['model_version']
        )
    
    def _row_to_list_item(self, row: sqlite3.Row) -> NoteListItem:
        """Convert database row to NoteListItem object"""
        return NoteListItem(
            id=row['id'],
            title=row['title'],
            folder_path=row['folder_path'],
            tags=json.loads(row['tags']) if row['tags'] else [],
            created_at=datetime.fromisoformat(row['created_at']),
            updated_at=datetime.fromisoformat(row['updated_at']),
            word_count=row['word_count'],
            confidence=row['confidence']
        )

