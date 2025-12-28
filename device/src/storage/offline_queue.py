"""
Persistent offline queue for detection events.
Ensures data integrity during intermittent connectivity.
"""

import logging
import sqlite3
import time
import json
import threading
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
from contextlib import contextmanager
from enum import Enum

logger = logging.getLogger(__name__)


class QueueItemStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class DetectionEventPayload:
    """Complete detection event payload for portal upload."""
    event_id: str
    device_id: str
    camera_id: str
    timestamp: float
    class_name: str
    class_id: int
    confidence: float
    bbox: List[int]
    image_path: Optional[str]
    image_base64: Optional[str]
    location: Dict[str, Any]
    metadata: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'DetectionEventPayload':
        return cls(**data)


class OfflineQueue:
    """
    Persistent queue for detection events with SQLite backing.
    Handles intermittent connectivity gracefully.
    
    Features:
    - Persistent storage survives restarts
    - Automatic retry with exponential backoff
    - Priority-based processing
    - Image data stored separately for efficiency
    """
    
    MAX_RETRY_ATTEMPTS = 5
    RETRY_BACKOFF_BASE = 60  # seconds
    
    def __init__(
        self,
        db_path: str,
        max_queue_size: int = 10000,
        max_image_size_mb: int = 50
    ):
        self.db_path = Path(db_path)
        self.max_queue_size = max_queue_size
        self.max_image_size_mb = max_image_size_mb
        self._lock = threading.Lock()
        self._initialized = False
    
    def initialize(self) -> bool:
        """Initialize the queue database."""
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            
            with self._get_connection() as conn:
                self._create_tables(conn)
            
            self._initialized = True
            logger.info(f"Offline queue initialized: {self.db_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize offline queue: {e}")
            return False
    
    @contextmanager
    def _get_connection(self):
        """Get database connection with proper settings."""
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=30.0,
            isolation_level=None
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        try:
            yield conn
        finally:
            conn.close()
    
    def _create_tables(self, conn: sqlite3.Connection):
        """Create queue tables."""
        conn.execute("""
            CREATE TABLE IF NOT EXISTS detection_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT UNIQUE NOT NULL,
                device_id TEXT NOT NULL,
                camera_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                class_name TEXT NOT NULL,
                class_id INTEGER NOT NULL,
                confidence REAL NOT NULL,
                bbox TEXT NOT NULL,
                image_path TEXT,
                location TEXT NOT NULL,
                metadata TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                priority INTEGER DEFAULT 0,
                attempts INTEGER DEFAULT 0,
                last_attempt REAL,
                next_retry REAL,
                error_message TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        
        conn.execute("""
            CREATE TABLE IF NOT EXISTS image_cache (
                event_id TEXT PRIMARY KEY,
                image_data BLOB NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at REAL NOT NULL
            )
        """)
        
        conn.execute("CREATE INDEX IF NOT EXISTS idx_queue_status ON detection_queue(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_queue_priority ON detection_queue(priority DESC, created_at ASC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_queue_next_retry ON detection_queue(next_retry)")
    
    def enqueue(
        self,
        payload: DetectionEventPayload,
        priority: int = 0,
        image_data: Optional[bytes] = None
    ) -> bool:
        """
        Add a detection event to the queue.
        
        Args:
            payload: Detection event data
            priority: Higher priority items processed first
            image_data: Raw image bytes (stored separately)
        
        Returns:
            True if successfully queued
        """
        with self._lock:
            try:
                with self._get_connection() as conn:
                    # Check queue size
                    count = conn.execute(
                        "SELECT COUNT(*) FROM detection_queue WHERE status = 'pending'"
                    ).fetchone()[0]
                    
                    if count >= self.max_queue_size:
                        # Remove oldest low-priority items
                        conn.execute("""
                            DELETE FROM detection_queue 
                            WHERE id IN (
                                SELECT id FROM detection_queue 
                                WHERE status = 'pending' AND priority <= 0
                                ORDER BY created_at ASC 
                                LIMIT 100
                            )
                        """)
                        logger.warning("Queue full, removed oldest items")
                    
                    now = time.time()
                    conn.execute("""
                        INSERT OR REPLACE INTO detection_queue 
                        (event_id, device_id, camera_id, timestamp, class_name, class_id,
                         confidence, bbox, image_path, location, metadata, status,
                         priority, attempts, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?, ?)
                    """, (
                        payload.event_id,
                        payload.device_id,
                        payload.camera_id,
                        payload.timestamp,
                        payload.class_name,
                        payload.class_id,
                        payload.confidence,
                        json.dumps(payload.bbox),
                        payload.image_path,
                        json.dumps(payload.location),
                        json.dumps(payload.metadata),
                        priority,
                        now,
                        now
                    ))
                    
                    # Store image data separately if provided
                    if image_data:
                        conn.execute("""
                            INSERT OR REPLACE INTO image_cache 
                            (event_id, image_data, size_bytes, created_at)
                            VALUES (?, ?, ?, ?)
                        """, (payload.event_id, image_data, len(image_data), now))
                    
                    logger.debug(f"Queued detection event: {payload.event_id}")
                    return True
                    
            except Exception as e:
                logger.error(f"Failed to enqueue detection: {e}")
                return False
    
    def get_pending_items(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get pending items ready for processing."""
        items = []
        now = time.time()
        
        try:
            with self._get_connection() as conn:
                rows = conn.execute("""
                    SELECT * FROM detection_queue 
                    WHERE status = 'pending' 
                    AND (next_retry IS NULL OR next_retry <= ?)
                    ORDER BY priority DESC, created_at ASC
                    LIMIT ?
                """, (now, limit)).fetchall()
                
                for row in rows:
                    item = dict(row)
                    item['bbox'] = json.loads(item['bbox'])
                    item['location'] = json.loads(item['location'])
                    item['metadata'] = json.loads(item['metadata'])
                    
                    # Get cached image if available
                    image_row = conn.execute(
                        "SELECT image_data FROM image_cache WHERE event_id = ?",
                        (item['event_id'],)
                    ).fetchone()
                    item['image_data'] = image_row['image_data'] if image_row else None
                    
                    items.append(item)
                    
        except Exception as e:
            logger.error(f"Failed to get pending items: {e}")
        
        return items
    
    def mark_in_progress(self, event_ids: List[str]):
        """Mark items as being processed."""
        if not event_ids:
            return
        
        with self._lock:
            try:
                with self._get_connection() as conn:
                    placeholders = ",".join("?" * len(event_ids))
                    conn.execute(f"""
                        UPDATE detection_queue 
                        SET status = 'in_progress', updated_at = ?
                        WHERE event_id IN ({placeholders})
                    """, [time.time()] + event_ids)
            except Exception as e:
                logger.error(f"Failed to mark items in progress: {e}")
    
    def mark_completed(self, event_ids: List[str]):
        """Mark items as successfully uploaded."""
        if not event_ids:
            return
        
        with self._lock:
            try:
                with self._get_connection() as conn:
                    placeholders = ",".join("?" * len(event_ids))
                    
                    # Delete from queue
                    conn.execute(f"""
                        DELETE FROM detection_queue 
                        WHERE event_id IN ({placeholders})
                    """, event_ids)
                    
                    # Delete cached images
                    conn.execute(f"""
                        DELETE FROM image_cache 
                        WHERE event_id IN ({placeholders})
                    """, event_ids)
                    
                    logger.debug(f"Completed {len(event_ids)} detection events")
            except Exception as e:
                logger.error(f"Failed to mark items completed: {e}")
    
    def mark_failed(self, event_id: str, error_message: str):
        """Mark item as failed with retry scheduling."""
        with self._lock:
            try:
                with self._get_connection() as conn:
                    row = conn.execute(
                        "SELECT attempts FROM detection_queue WHERE event_id = ?",
                        (event_id,)
                    ).fetchone()
                    
                    if not row:
                        return
                    
                    attempts = row['attempts'] + 1
                    now = time.time()
                    
                    if attempts >= self.MAX_RETRY_ATTEMPTS:
                        # Move to failed status permanently
                        conn.execute("""
                            UPDATE detection_queue 
                            SET status = 'failed', attempts = ?, last_attempt = ?,
                                error_message = ?, updated_at = ?
                            WHERE event_id = ?
                        """, (attempts, now, error_message, now, event_id))
                        logger.warning(f"Detection {event_id} permanently failed after {attempts} attempts")
                    else:
                        # Schedule retry with exponential backoff
                        backoff = self.RETRY_BACKOFF_BASE * (2 ** (attempts - 1))
                        next_retry = now + backoff
                        
                        conn.execute("""
                            UPDATE detection_queue 
                            SET status = 'pending', attempts = ?, last_attempt = ?,
                                next_retry = ?, error_message = ?, updated_at = ?
                            WHERE event_id = ?
                        """, (attempts, now, next_retry, error_message, now, event_id))
                        logger.debug(f"Detection {event_id} scheduled for retry in {backoff}s")
                        
            except Exception as e:
                logger.error(f"Failed to mark item failed: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get queue statistics."""
        stats = {
            "initialized": self._initialized,
            "path": str(self.db_path),
            "pending": 0,
            "in_progress": 0,
            "failed": 0,
            "image_cache_mb": 0
        }
        
        try:
            with self._get_connection() as conn:
                for status in ['pending', 'in_progress', 'failed']:
                    count = conn.execute(
                        "SELECT COUNT(*) FROM detection_queue WHERE status = ?",
                        (status,)
                    ).fetchone()[0]
                    stats[status] = count
                
                cache_size = conn.execute(
                    "SELECT COALESCE(SUM(size_bytes), 0) FROM image_cache"
                ).fetchone()[0]
                stats["image_cache_mb"] = round(cache_size / (1024 * 1024), 2)
                
        except Exception as e:
            logger.error(f"Failed to get queue stats: {e}")
        
        return stats
    
    def cleanup_old_failed(self, days: int = 7) -> int:
        """Remove old failed items."""
        cutoff = time.time() - (days * 86400)
        deleted = 0
        
        with self._lock:
            try:
                with self._get_connection() as conn:
                    # Get event IDs to delete
                    rows = conn.execute("""
                        SELECT event_id FROM detection_queue 
                        WHERE status = 'failed' AND updated_at < ?
                    """, (cutoff,)).fetchall()
                    
                    event_ids = [row['event_id'] for row in rows]
                    
                    if event_ids:
                        placeholders = ",".join("?" * len(event_ids))
                        conn.execute(f"DELETE FROM detection_queue WHERE event_id IN ({placeholders})", event_ids)
                        conn.execute(f"DELETE FROM image_cache WHERE event_id IN ({placeholders})", event_ids)
                        deleted = len(event_ids)
                        
                    if deleted > 0:
                        logger.info(f"Cleaned up {deleted} old failed detection events")
                        
            except Exception as e:
                logger.error(f"Failed to cleanup old failed items: {e}")
        
        return deleted
