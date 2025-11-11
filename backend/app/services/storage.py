"""
Storage service for notes with multi-database support.

Supports:
- SQLite with FTS5 for local development
- PostgreSQL with full-text search for production
All content stored in database, no file system dependencies.
"""

import os
import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
from contextlib import contextmanager
from urllib.parse import urlparse

from .models import Note, NoteMetadata, NoteListItem, FolderNode, FolderStats, SearchResult
from ..config import config


class DatabaseAdapter:
    """Base class for database adapters"""
    
    def get_connection(self):
        raise NotImplementedError
    
    def init_schema(self, conn):
        raise NotImplementedError
    
    def close(self, conn):
        raise NotImplementedError


class SQLiteAdapter(DatabaseAdapter):
    """SQLite database adapter with FTS5"""
    
    def __init__(self, db_path: Path):
        import sqlite3
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.sqlite3 = sqlite3
    
    def get_connection(self):
        conn = self.sqlite3.connect(str(self.db_path))
        conn.row_factory = self.sqlite3.Row
        return conn
    
    def init_schema(self, conn):
        """Initialize SQLite schema with FTS5"""
        # Enable WAL mode for better concurrency
        conn.execute("PRAGMA journal_mode=WAL")
        
        # Main notes table with user isolation
        conn.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
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
        
        # Indexes - optimized for user-scoped queries
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_user_folder ON notes(user_id, folder_path)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_user_created ON notes(user_id, created_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC)")
        
        # FTS5 virtual table
        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                note_id UNINDEXED,
                title,
                content,
                tags
            )
        """)
        
        # FTS triggers
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
        
        conn.commit()
    
    def close(self, conn):
        conn.close()


class PostgreSQLAdapter(DatabaseAdapter):
    """PostgreSQL database adapter with full-text search"""
    
    def __init__(self, database_url: str):
        import psycopg2
        import psycopg2.extras
        self.database_url = database_url
        self.psycopg2 = psycopg2
        self.extras = psycopg2.extras
    
    def get_connection(self):
        conn = self.psycopg2.connect(self.database_url)
        return conn
    
    def init_schema(self, conn):
        """Initialize PostgreSQL schema with full-text search"""
        cursor = conn.cursor()
        
        # Main notes table with user isolation
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                folder_path TEXT NOT NULL,
                tags JSONB,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                word_count INTEGER DEFAULT 0,
                confidence REAL,
                transcription_duration REAL,
                model_version TEXT,
                search_vector tsvector
            )
        """)
        
        # Indexes - optimized for user-scoped queries
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_user_folder ON notes(user_id, folder_path)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_user_created ON notes(user_id, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes USING gin(tags)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notes_search ON notes USING gin(search_vector)")
        
        # Function to update search vector
        cursor.execute("""
            CREATE OR REPLACE FUNCTION notes_search_update() RETURNS trigger AS $$
            BEGIN
                NEW.search_vector := 
                    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B') ||
                    setweight(to_tsvector('english', coalesce(NEW.tags::text, '')), 'C');
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
        """)
        
        # Trigger for search vector
        cursor.execute("""
            DROP TRIGGER IF EXISTS notes_search_vector_update ON notes;
        """)
        
        cursor.execute("""
            CREATE TRIGGER notes_search_vector_update
            BEFORE INSERT OR UPDATE ON notes
            FOR EACH ROW EXECUTE FUNCTION notes_search_update();
        """)
        
        conn.commit()
        cursor.close()
    
    def close(self, conn):
        conn.close()


class NoteStorage:
    """
    Multi-database storage for notes.
    
    Features:
    - Auto-detects database type from DATABASE_URL or uses SQLite
    - SQLite with FTS5 for local development
    - PostgreSQL with full-text search for production
    - Transaction safety
    - Automatic schema initialization
    """
    
    def __init__(self, db_path: Optional[Path] = None, database_url: Optional[str] = None):
        """
        Initialize storage with database.
        
        Args:
            db_path: Path to SQLite database (used if DATABASE_URL not set)
            database_url: PostgreSQL connection URL (overrides db_path)
        """
        # Check for DATABASE_URL environment variable
        database_url = database_url or os.getenv("DATABASE_URL")
        
        if database_url and database_url.startswith("postgres"):
            # Use PostgreSQL
            self.adapter = PostgreSQLAdapter(database_url)
            self.db_type = "postgresql"
        else:
            # Use SQLite
            if db_path is None:
                db_path = config.DB_PATH
            self.adapter = SQLiteAdapter(Path(db_path))
            self.db_type = "sqlite"
        
        # Initialize database schema
        self._init_database()
    
    @contextmanager
    def _get_connection(self):
        """Get database connection with automatic commit/rollback"""
        conn = self.adapter.get_connection()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self.adapter.close(conn)
    
    def _init_database(self):
        """Initialize database schema"""
        with self._get_connection() as conn:
            self.adapter.init_schema(conn)
    
    def _execute_query(self, conn, query: str, params: tuple = ()) -> Any:
        """Execute query with appropriate cursor for database type"""
        if self.db_type == "postgresql":
            cursor = conn.cursor(cursor_factory=self.adapter.extras.RealDictCursor)
            cursor.execute(query, params)
            return cursor
        else:
            return conn.execute(query, params)
    
    def _serialize_tags(self, tags: List[str]) -> Any:
        """Serialize tags based on database type"""
        if self.db_type == "postgresql":
            return json.dumps(tags)
        else:
            return json.dumps(tags)
    
    def _deserialize_tags(self, tags: Any) -> List[str]:
        """Deserialize tags based on database type"""
        if not tags:
            return []
        if isinstance(tags, str):
            return json.loads(tags)
        return tags  # PostgreSQL JSONB already returns list
    
    def save_note(self, user_id: str, content: str, metadata: NoteMetadata) -> str:
        """
        Save a new note to the database.
        
        Args:
            user_id: Clerk user ID (from authentication)
            content: Full markdown content
            metadata: Note metadata
            
        Returns:
            Note ID (UUID)
        """
        note = Note(
            user_id=user_id,
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
            if self.db_type == "postgresql":
                query = """
                    INSERT INTO notes (
                        id, user_id, title, content, folder_path, tags,
                        created_at, updated_at, word_count, confidence,
                        transcription_duration, model_version
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
            else:
                query = """
                    INSERT INTO notes (
                        id, user_id, title, content, folder_path, tags,
                        created_at, updated_at, word_count, confidence,
                        transcription_duration, model_version
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
            
            self._execute_query(conn, query, (
                note.id,
                note.user_id,
                note.title,
                note.content,
                note.folder_path,
                self._serialize_tags(note.tags),
                note.created_at.isoformat(),
                note.updated_at.isoformat(),
                note.word_count,
                note.confidence,
                note.transcription_duration,
                note.model_version
            ))
        
        return note.id
    
    def get_note(self, user_id: str, note_id: str) -> Optional[Note]:
        """
        Retrieve a note by ID (user-scoped).
        
        Args:
            user_id: Clerk user ID
            note_id: Note UUID
            
        Returns:
            Note object or None if not found/not owned by user
        """
        with self._get_connection() as conn:
            if self.db_type == "postgresql":
                query = "SELECT * FROM notes WHERE id = %s AND user_id = %s"
            else:
                query = "SELECT * FROM notes WHERE id = ? AND user_id = ?"
            
            cursor = self._execute_query(conn, query, (note_id, user_id))
            row = cursor.fetchone()
            
            if not row:
                return None
            
            return self._row_to_note(row)
    
    def update_note(
        self,
        user_id: str,
        note_id: str,
        content: Optional[str] = None,
        metadata: Optional[NoteMetadata] = None
    ) -> bool:
        """
        Update an existing note (user-scoped).
        
        Args:
            user_id: Clerk user ID
            note_id: Note UUID
            content: New content (optional)
            metadata: New metadata (optional)
            
        Returns:
            True if updated, False if not found/not owned by user
        """
        existing = self.get_note(user_id, note_id)
        if not existing:
            return False
        
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
                updates["tags"] = self._serialize_tags(metadata.tags)
            if metadata.confidence is not None:
                updates["confidence"] = metadata.confidence
        
        set_clause = ", ".join(f"{k} = %s" if self.db_type == "postgresql" else f"{k} = ?" for k in updates.keys())
        values = list(updates.values()) + [note_id]
        
        with self._get_connection() as conn:
            if self.db_type == "postgresql":
                query = f"UPDATE notes SET {set_clause} WHERE id = %s AND user_id = %s"
            else:
                query = f"UPDATE notes SET {set_clause} WHERE id = ? AND user_id = ?"
            
            values.append(user_id)
            self._execute_query(conn, query, tuple(values))
        
        return True
    
    def delete_note(self, user_id: str, note_id: str) -> bool:
        """
        Delete a note (user-scoped).
        
        Args:
            user_id: Clerk user ID
            note_id: Note UUID
            
        Returns:
            True if deleted, False if not found/not owned by user
        """
        with self._get_connection() as conn:
            if self.db_type == "postgresql":
                query = "DELETE FROM notes WHERE id = %s AND user_id = %s"
            else:
                query = "DELETE FROM notes WHERE id = ? AND user_id = ?"
            
            cursor = self._execute_query(conn, query, (note_id, user_id))
            return cursor.rowcount > 0
    
    def list_notes(
        self,
        user_id: str,
        folder: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        order_by: str = "updated_at"
    ) -> List[NoteListItem]:
        """
        List notes with optional filtering (user-scoped).
        
        Args:
            user_id: Clerk user ID
            folder: Filter by folder path (optional)
            limit: Maximum number of results
            offset: Pagination offset
            order_by: Sort field (created_at, updated_at, title)
            
        Returns:
            List of NoteListItem objects
        """
        query = """
            SELECT id, user_id, title, folder_path, tags, created_at, updated_at, 
                   word_count, confidence
            FROM notes
            WHERE user_id = {}
        """.format('%s' if self.db_type == "postgresql" else '?')
        params = [user_id]
        
        if folder:
            if self.db_type == "postgresql":
                query += " AND (folder_path = %s OR folder_path LIKE %s)"
            else:
                query += " AND (folder_path = ? OR folder_path LIKE ?)"
            params.extend([folder, f"{folder}/%"])
        
        if self.db_type == "postgresql":
            query += f" ORDER BY {order_by} DESC LIMIT %s OFFSET %s"
        else:
            query += f" ORDER BY {order_by} DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        with self._get_connection() as conn:
            cursor = self._execute_query(conn, query, tuple(params))
            rows = cursor.fetchall()
            return [self._row_to_list_item(row) for row in rows]
    
    def search_notes(self, user_id: str, query: str, limit: int = 50) -> List[SearchResult]:
        """
        Full-text search across notes (user-scoped).
        
        Args:
            user_id: Clerk user ID
            query: Search query
            limit: Maximum results
            
        Returns:
            List of SearchResult objects with ranking
        """
        with self._get_connection() as conn:
            if self.db_type == "postgresql":
                # PostgreSQL full-text search
                sql_query = """
                    SELECT 
                        id, user_id, title, folder_path, tags, created_at,
                        updated_at, word_count, confidence,
                        ts_rank(search_vector, plainto_tsquery('english', %s)) as rank,
                        ts_headline('english', content, plainto_tsquery('english', %s),
                            'MaxWords=50, MinWords=25, ShortWord=3') as snippet
                    FROM notes
                    WHERE user_id = %s AND search_vector @@ plainto_tsquery('english', %s)
                    ORDER BY rank DESC
                    LIMIT %s
                """
                cursor = self._execute_query(conn, sql_query, (query, query, user_id, query, limit))
            else:
                # SQLite FTS5 search
                sql_query = """
                    SELECT 
                        n.id, n.user_id, n.title, n.folder_path, n.tags, n.created_at,
                        n.updated_at, n.word_count, n.confidence,
                        rank,
                        snippet(notes_fts, 2, '<mark>', '</mark>', '...', 50) as snippet
                    FROM notes_fts
                    JOIN notes n ON notes_fts.note_id = n.id
                    WHERE n.user_id = ? AND notes_fts MATCH ?
                    ORDER BY rank
                    LIMIT ?
                """
                cursor = self._execute_query(conn, sql_query, (user_id, query, limit))
            
            rows = cursor.fetchall()
            results = []
            for row in rows:
                note = self._row_to_list_item(row)
                rank_value = abs(row['rank']) if self.db_type == "sqlite" else row['rank']
                results.append(SearchResult(
                    note=note,
                    rank=rank_value,
                    snippet=row['snippet']
                ))
            
            return results
    
    def get_folder_tree(self, user_id: str) -> FolderNode:
        """
        Get folder hierarchy with note counts (user-scoped).
        
        Args:
            user_id: Clerk user ID
            
        Returns:
            Root FolderNode with nested subfolders
        """
        with self._get_connection() as conn:
            if self.db_type == "postgresql":
                query = """
                    SELECT folder_path, COUNT(*) as count
                    FROM notes
                    WHERE user_id = %s
                    GROUP BY folder_path
                    ORDER BY folder_path
                """
            else:
                query = """
                    SELECT folder_path, COUNT(*) as count
                    FROM notes
                    WHERE user_id = ?
                    GROUP BY folder_path
                    ORDER BY folder_path
                """
            cursor = self._execute_query(conn, query, (user_id,))
            rows = cursor.fetchall()
            
            root = FolderNode(name="", path="", note_count=0)
            folder_map = {"": root}
            
            for row in rows:
                path = row['folder_path']
                count = row['count']
                
                parts = path.split('/')
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
                
                parent.note_count = count
            
            return root
    
    def get_all_tags(self, user_id: str) -> List[str]:
        """
        Get all unique tags across user's notes.
        
        Args:
            user_id: Clerk user ID
            
        Returns:
            Sorted list of tag names
        """
        with self._get_connection() as conn:
            if self.db_type == "postgresql":
                query = "SELECT tags FROM notes WHERE user_id = %s AND tags IS NOT NULL"
            else:
                query = "SELECT tags FROM notes WHERE user_id = ? AND tags IS NOT NULL"
            cursor = self._execute_query(conn, query, (user_id,))
            rows = cursor.fetchall()
            
            tags = set()
            for row in rows:
                if row['tags']:
                    tags.update(self._deserialize_tags(row['tags']))
            
            return sorted(tags)
    
    def get_notes_by_tag(self, user_id: str, tag: str, limit: int = 50) -> List[NoteListItem]:
        """
        Get notes that have a specific tag (user-scoped).
        
        Args:
            user_id: Clerk user ID
            tag: Tag name
            limit: Maximum results
            
        Returns:
            List of NoteListItem objects
        """
        with self._get_connection() as conn:
            if self.db_type == "postgresql":
                query = """
                    SELECT id, user_id, title, folder_path, tags, created_at, updated_at,
                           word_count, confidence
                    FROM notes
                    WHERE user_id = %s AND tags @> %s::jsonb
                    ORDER BY updated_at DESC
                    LIMIT %s
                """
                params = (user_id, json.dumps([tag]), limit)
            else:
                query = """
                    SELECT id, user_id, title, folder_path, tags, created_at, updated_at,
                           word_count, confidence
                    FROM notes
                    WHERE user_id = ? AND tags LIKE ?
                    ORDER BY updated_at DESC
                    LIMIT ?
                """
                params = (user_id, f'%"{tag}"%', limit)
            
            cursor = self._execute_query(conn, query, params)
            rows = cursor.fetchall()
            return [self._row_to_list_item(row) for row in rows]
    
    def get_note_count(self, user_id: str, folder: Optional[str] = None) -> int:
        """
        Get total note count (user-scoped), optionally filtered by folder.
        
        Args:
            user_id: Clerk user ID
            folder: Folder path (optional)
            
        Returns:
            Number of notes
        """
        with self._get_connection() as conn:
            if folder:
                if self.db_type == "postgresql":
                    query = """
                        SELECT COUNT(*) as count FROM notes
                        WHERE user_id = %s AND (folder_path = %s OR folder_path LIKE %s)
                    """
                else:
                    query = """
                        SELECT COUNT(*) as count FROM notes
                        WHERE user_id = ? AND (folder_path = ? OR folder_path LIKE ?)
                    """
                params = (user_id, folder, f"{folder}/%")
            else:
                if self.db_type == "postgresql":
                    query = "SELECT COUNT(*) as count FROM notes WHERE user_id = %s"
                else:
                    query = "SELECT COUNT(*) as count FROM notes WHERE user_id = ?"
                params = (user_id,)
            
            cursor = self._execute_query(conn, query, params)
            result = cursor.fetchone()
            return result['count']
    
    def get_folder_stats(self, user_id: str, folder: str) -> Optional[FolderStats]:
        """
        Get statistics for a folder (user-scoped).
        
        Args:
            user_id: Clerk user ID
            folder: Folder path
            
        Returns:
            FolderStats object or None
        """
        with self._get_connection() as conn:
            if self.db_type == "postgresql":
                query = """
                    SELECT 
                        COUNT(*) as count,
                        SUM(transcription_duration) as total_duration,
                        AVG(confidence) as avg_confidence
                    FROM notes
                    WHERE user_id = %s AND (folder_path = %s OR folder_path LIKE %s)
                """
            else:
                query = """
                    SELECT 
                        COUNT(*) as count,
                        SUM(transcription_duration) as total_duration,
                        AVG(confidence) as avg_confidence
                    FROM notes
                    WHERE user_id = ? AND (folder_path = ? OR folder_path LIKE ?)
                """
            
            cursor = self._execute_query(conn, query, (user_id, folder, f"{folder}/%"))
            row = cursor.fetchone()
            
            if row['count'] == 0:
                return None
            
            # Get most common tags
            if self.db_type == "postgresql":
                tag_query = """
                    SELECT tags FROM notes
                    WHERE user_id = %s AND (folder_path = %s OR folder_path LIKE %s) AND tags IS NOT NULL
                """
            else:
                tag_query = """
                    SELECT tags FROM notes
                    WHERE user_id = ? AND (folder_path = ? OR folder_path LIKE ?) AND tags IS NOT NULL
                """
            
            cursor = self._execute_query(conn, tag_query, (user_id, folder, f"{folder}/%"))
            tag_rows = cursor.fetchall()
            
            tag_counts = {}
            for tag_row in tag_rows:
                if tag_row['tags']:
                    for tag in self._deserialize_tags(tag_row['tags']):
                        tag_counts[tag] = tag_counts.get(tag, 0) + 1
            
            most_common = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            tags = [tag for tag, _ in most_common]
            
            return FolderStats(
                path=folder,
                note_count=row['count'],
                total_duration=row['total_duration'] or 0.0,
                avg_confidence=row['avg_confidence'],
                most_common_tags=tags
            )
    
    def _row_to_note(self, row: Dict) -> Note:
        """Convert database row to Note object"""
        return Note(
            id=row['id'],
            user_id=row['user_id'],
            title=row['title'],
            content=row['content'],
            folder_path=row['folder_path'],
            tags=self._deserialize_tags(row['tags']),
            created_at=datetime.fromisoformat(row['created_at']) if isinstance(row['created_at'], str) else row['created_at'],
            updated_at=datetime.fromisoformat(row['updated_at']) if isinstance(row['updated_at'], str) else row['updated_at'],
            word_count=row['word_count'],
            confidence=row['confidence'],
            transcription_duration=row['transcription_duration'],
            model_version=row['model_version']
        )
    
    def _row_to_list_item(self, row: Dict) -> NoteListItem:
        """Convert database row to NoteListItem object"""
        return NoteListItem(
            id=row['id'],
            user_id=row['user_id'],
            title=row['title'],
            folder_path=row['folder_path'],
            tags=self._deserialize_tags(row['tags']),
            created_at=datetime.fromisoformat(row['created_at']) if isinstance(row['created_at'], str) else row['created_at'],
            updated_at=datetime.fromisoformat(row['updated_at']) if isinstance(row['updated_at'], str) else row['updated_at'],
            word_count=row['word_count'],
            confidence=row['confidence']
        )
