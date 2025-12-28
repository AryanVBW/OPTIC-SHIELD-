"""
Robust message broker for guaranteed delivery of detection events.
Implements acknowledgment-based delivery, dead-letter queue, and circuit breaker pattern.
"""

import logging
import sqlite3
import time
import json
import threading
import hashlib
import uuid
from pathlib import Path
from typing import Optional, List, Dict, Any, Callable
from dataclasses import dataclass, asdict, field
from contextlib import contextmanager
from enum import Enum
from collections import deque

logger = logging.getLogger(__name__)


class MessageStatus(Enum):
    """Status of a message in the queue."""
    PENDING = "pending"
    IN_FLIGHT = "in_flight"
    ACKNOWLEDGED = "acknowledged"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"


class MessagePriority(Enum):
    """Priority levels for messages."""
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


@dataclass
class Message:
    """Represents a message in the broker."""
    id: str
    topic: str
    payload: Dict[str, Any]
    priority: int = MessagePriority.NORMAL.value
    status: str = MessageStatus.PENDING.value
    attempts: int = 0
    max_attempts: int = 10
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    scheduled_at: float = field(default_factory=time.time)
    expires_at: Optional[float] = None
    last_error: Optional[str] = None
    checksum: Optional[str] = None
    ack_token: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Message':
        return cls(**data)
    
    def compute_checksum(self) -> str:
        """Compute SHA256 checksum of payload for integrity verification."""
        payload_str = json.dumps(self.payload, sort_keys=True)
        return hashlib.sha256(payload_str.encode()).hexdigest()[:16]


class CircuitBreaker:
    """
    Circuit breaker pattern for fault tolerance.
    Prevents cascading failures by temporarily disabling operations.
    """
    
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing if service recovered
    
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        half_open_max_calls: int = 3
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        
        self._state = self.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[float] = None
        self._half_open_calls = 0
        self._lock = threading.Lock()
    
    @property
    def state(self) -> str:
        with self._lock:
            if self._state == self.OPEN:
                if time.time() - self._last_failure_time >= self.recovery_timeout:
                    self._state = self.HALF_OPEN
                    self._half_open_calls = 0
            return self._state
    
    def is_available(self) -> bool:
        """Check if the circuit allows requests."""
        return self.state != self.OPEN
    
    def record_success(self):
        """Record a successful operation."""
        with self._lock:
            if self._state == self.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.half_open_max_calls:
                    self._state = self.CLOSED
                    self._failure_count = 0
                    self._success_count = 0
                    logger.info("Circuit breaker closed - service recovered")
            elif self._state == self.CLOSED:
                self._failure_count = max(0, self._failure_count - 1)
    
    def record_failure(self, error: Optional[str] = None):
        """Record a failed operation."""
        with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()
            
            if self._state == self.HALF_OPEN:
                self._state = self.OPEN
                logger.warning(f"Circuit breaker opened (half-open failed): {error}")
            elif self._failure_count >= self.failure_threshold:
                self._state = self.OPEN
                logger.warning(f"Circuit breaker opened after {self._failure_count} failures: {error}")
    
    def get_stats(self) -> Dict[str, Any]:
        return {
            "state": self.state,
            "failure_count": self._failure_count,
            "success_count": self._success_count,
            "last_failure_time": self._last_failure_time
        }


class MessageBroker:
    """
    Production-grade message broker with guaranteed delivery.
    
    Features:
    - SQLite-backed persistent storage
    - Acknowledgment-based delivery
    - Dead-letter queue for failed messages
    - Circuit breaker for fault tolerance
    - Exponential backoff with jitter
    - Message deduplication
    - Priority queue
    - Message expiration
    - Checksum verification
    """
    
    DEFAULT_MAX_ATTEMPTS = 10
    DEFAULT_BACKOFF_BASE = 30  # seconds
    DEFAULT_BACKOFF_MAX = 3600  # 1 hour max
    DEFAULT_MESSAGE_TTL = 86400 * 7  # 7 days
    
    def __init__(
        self,
        db_path: str,
        max_queue_size: int = 50000,
        max_in_flight: int = 100,
        visibility_timeout: float = 300.0,
        enable_dedup: bool = True,
        dedup_window: float = 300.0
    ):
        self.db_path = Path(db_path)
        self.max_queue_size = max_queue_size
        self.max_in_flight = max_in_flight
        self.visibility_timeout = visibility_timeout
        self.enable_dedup = enable_dedup
        self.dedup_window = dedup_window
        
        self._lock = threading.RLock()
        self._initialized = False
        self._circuit_breaker = CircuitBreaker()
        
        # Recent message checksums for deduplication
        self._recent_checksums: deque = deque(maxlen=10000)
        self._checksum_times: Dict[str, float] = {}
        
        # Subscribers
        self._subscribers: Dict[str, List[Callable]] = {}
        
        # Stats
        self._stats = {
            "enqueued": 0,
            "acknowledged": 0,
            "failed": 0,
            "dead_lettered": 0,
            "duplicates_rejected": 0
        }
    
    def initialize(self) -> bool:
        """Initialize the message broker database."""
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            
            with self._get_connection() as conn:
                self._create_tables(conn)
                self._recover_in_flight_messages(conn)
            
            self._initialized = True
            logger.info(f"Message broker initialized: {self.db_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize message broker: {e}")
            return False
    
    @contextmanager
    def _get_connection(self):
        """Get database connection with proper settings."""
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=30.0,
            isolation_level="DEFERRED"
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=30000")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    
    def _create_tables(self, conn: sqlite3.Connection):
        """Create message broker tables."""
        # Main message queue
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                topic TEXT NOT NULL,
                payload TEXT NOT NULL,
                priority INTEGER DEFAULT 1,
                status TEXT DEFAULT 'pending',
                attempts INTEGER DEFAULT 0,
                max_attempts INTEGER DEFAULT 10,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                scheduled_at REAL NOT NULL,
                expires_at REAL,
                last_error TEXT,
                checksum TEXT,
                ack_token TEXT,
                metadata TEXT
            )
        """)
        
        # Dead letter queue
        conn.execute("""
            CREATE TABLE IF NOT EXISTS dead_letter_queue (
                id TEXT PRIMARY KEY,
                original_id TEXT NOT NULL,
                topic TEXT NOT NULL,
                payload TEXT NOT NULL,
                attempts INTEGER NOT NULL,
                last_error TEXT,
                created_at REAL NOT NULL,
                dead_lettered_at REAL NOT NULL,
                metadata TEXT
            )
        """)
        
        # Acknowledgment log for audit trail
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ack_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT NOT NULL,
                ack_token TEXT NOT NULL,
                status TEXT NOT NULL,
                response TEXT,
                timestamp REAL NOT NULL
            )
        """)
        
        # Indexes for efficient queries
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_priority ON messages(priority DESC, scheduled_at ASC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON messages(scheduled_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_checksum ON messages(checksum)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dlq_topic ON dead_letter_queue(topic)")
    
    def _recover_in_flight_messages(self, conn: sqlite3.Connection):
        """Recover messages that were in-flight during a crash."""
        now = time.time()
        cutoff = now - self.visibility_timeout
        
        result = conn.execute("""
            UPDATE messages 
            SET status = 'pending', updated_at = ?
            WHERE status = 'in_flight' AND updated_at < ?
        """, (now, cutoff))
        
        if result.rowcount > 0:
            logger.info(f"Recovered {result.rowcount} in-flight messages")
    
    def publish(
        self,
        topic: str,
        payload: Dict[str, Any],
        priority: MessagePriority = MessagePriority.NORMAL,
        delay_seconds: float = 0,
        ttl_seconds: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None
    ) -> Optional[str]:
        """
        Publish a message to the broker.
        
        Args:
            topic: Message topic/channel
            payload: Message payload
            priority: Message priority
            delay_seconds: Delay before message becomes visible
            ttl_seconds: Time-to-live for the message
            metadata: Additional metadata
            idempotency_key: Key for deduplication
        
        Returns:
            Message ID if successful, None otherwise
        """
        with self._lock:
            try:
                now = time.time()
                message_id = idempotency_key or str(uuid.uuid4())
                
                # Compute checksum for deduplication
                checksum = hashlib.sha256(
                    json.dumps(payload, sort_keys=True).encode()
                ).hexdigest()[:16]
                
                # Check for duplicates
                if self.enable_dedup:
                    if self._is_duplicate(checksum):
                        self._stats["duplicates_rejected"] += 1
                        logger.debug(f"Duplicate message rejected: {checksum}")
                        return None
                
                with self._get_connection() as conn:
                    # Check queue size
                    count = conn.execute(
                        "SELECT COUNT(*) FROM messages WHERE status IN ('pending', 'in_flight')"
                    ).fetchone()[0]
                    
                    if count >= self.max_queue_size:
                        self._evict_old_messages(conn)
                    
                    # Insert message
                    conn.execute("""
                        INSERT OR REPLACE INTO messages 
                        (id, topic, payload, priority, status, attempts, max_attempts,
                         created_at, updated_at, scheduled_at, expires_at, checksum, metadata)
                        VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        message_id,
                        topic,
                        json.dumps(payload),
                        priority.value if isinstance(priority, MessagePriority) else priority,
                        self.DEFAULT_MAX_ATTEMPTS,
                        now,
                        now,
                        now + delay_seconds,
                        now + (ttl_seconds or self.DEFAULT_MESSAGE_TTL),
                        checksum,
                        json.dumps(metadata or {})
                    ))
                
                # Track checksum for deduplication
                self._recent_checksums.append(checksum)
                self._checksum_times[checksum] = now
                
                self._stats["enqueued"] += 1
                logger.debug(f"Published message {message_id} to topic {topic}")
                return message_id
                
            except Exception as e:
                logger.error(f"Failed to publish message: {e}")
                return None
    
    def _is_duplicate(self, checksum: str) -> bool:
        """Check if a message is a duplicate based on checksum."""
        if checksum not in self._checksum_times:
            return False
        
        # Check if within dedup window
        if time.time() - self._checksum_times[checksum] < self.dedup_window:
            return True
        
        # Expired, remove from tracking
        del self._checksum_times[checksum]
        return False
    
    def _evict_old_messages(self, conn: sqlite3.Connection):
        """Evict oldest low-priority messages when queue is full."""
        conn.execute("""
            DELETE FROM messages 
            WHERE id IN (
                SELECT id FROM messages 
                WHERE status = 'pending' AND priority <= 1
                ORDER BY created_at ASC 
                LIMIT 100
            )
        """)
        logger.warning("Queue full, evicted oldest low-priority messages")
    
    def consume(
        self,
        topic: str,
        batch_size: int = 10,
        visibility_timeout: Optional[float] = None
    ) -> List[Message]:
        """
        Consume messages from a topic.
        
        Messages are marked as in-flight and must be acknowledged.
        """
        if not self._circuit_breaker.is_available():
            logger.debug("Circuit breaker open, skipping consume")
            return []
        
        messages = []
        now = time.time()
        timeout = visibility_timeout or self.visibility_timeout
        
        try:
            with self._get_connection() as conn:
                # Check in-flight count
                in_flight = conn.execute(
                    "SELECT COUNT(*) FROM messages WHERE status = 'in_flight'"
                ).fetchone()[0]
                
                if in_flight >= self.max_in_flight:
                    return []
                
                # Fetch pending messages
                rows = conn.execute("""
                    SELECT * FROM messages 
                    WHERE topic = ? 
                    AND status = 'pending'
                    AND scheduled_at <= ?
                    AND (expires_at IS NULL OR expires_at > ?)
                    ORDER BY priority DESC, scheduled_at ASC
                    LIMIT ?
                """, (topic, now, now, batch_size)).fetchall()
                
                for row in rows:
                    ack_token = str(uuid.uuid4())
                    
                    # Mark as in-flight
                    conn.execute("""
                        UPDATE messages 
                        SET status = 'in_flight', 
                            ack_token = ?,
                            updated_at = ?
                        WHERE id = ?
                    """, (ack_token, now, row['id']))
                    
                    message = Message(
                        id=row['id'],
                        topic=row['topic'],
                        payload=json.loads(row['payload']),
                        priority=row['priority'],
                        status=MessageStatus.IN_FLIGHT.value,
                        attempts=row['attempts'],
                        max_attempts=row['max_attempts'],
                        created_at=row['created_at'],
                        updated_at=now,
                        scheduled_at=row['scheduled_at'],
                        expires_at=row['expires_at'],
                        last_error=row['last_error'],
                        checksum=row['checksum'],
                        ack_token=ack_token,
                        metadata=json.loads(row['metadata'] or '{}')
                    )
                    messages.append(message)
                
        except Exception as e:
            logger.error(f"Failed to consume messages: {e}")
            self._circuit_breaker.record_failure(str(e))
        
        return messages
    
    def acknowledge(
        self,
        message_id: str,
        ack_token: str,
        response: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Acknowledge successful processing of a message.
        
        Args:
            message_id: ID of the message
            ack_token: Acknowledgment token received during consume
            response: Optional response data from the server
        
        Returns:
            True if acknowledged successfully
        """
        with self._lock:
            try:
                now = time.time()
                
                with self._get_connection() as conn:
                    # Verify ack token
                    row = conn.execute(
                        "SELECT ack_token FROM messages WHERE id = ? AND status = 'in_flight'",
                        (message_id,)
                    ).fetchone()
                    
                    if not row or row['ack_token'] != ack_token:
                        logger.warning(f"Invalid ack token for message {message_id}")
                        return False
                    
                    # Delete the message (successfully processed)
                    conn.execute("DELETE FROM messages WHERE id = ?", (message_id,))
                    
                    # Log acknowledgment
                    conn.execute("""
                        INSERT INTO ack_log (message_id, ack_token, status, response, timestamp)
                        VALUES (?, ?, 'acknowledged', ?, ?)
                    """, (message_id, ack_token, json.dumps(response or {}), now))
                
                self._stats["acknowledged"] += 1
                self._circuit_breaker.record_success()
                logger.debug(f"Message {message_id} acknowledged")
                return True
                
            except Exception as e:
                logger.error(f"Failed to acknowledge message: {e}")
                return False
    
    def negative_acknowledge(
        self,
        message_id: str,
        ack_token: str,
        error: str,
        retry: bool = True
    ) -> bool:
        """
        Negative acknowledge - message processing failed.
        
        Args:
            message_id: ID of the message
            ack_token: Acknowledgment token
            error: Error message
            retry: Whether to retry the message
        
        Returns:
            True if processed successfully
        """
        with self._lock:
            try:
                now = time.time()
                
                with self._get_connection() as conn:
                    row = conn.execute(
                        "SELECT * FROM messages WHERE id = ? AND status = 'in_flight'",
                        (message_id,)
                    ).fetchone()
                    
                    if not row or row['ack_token'] != ack_token:
                        return False
                    
                    attempts = row['attempts'] + 1
                    
                    if not retry or attempts >= row['max_attempts']:
                        # Move to dead letter queue
                        self._move_to_dlq(conn, row, error)
                        self._stats["dead_lettered"] += 1
                    else:
                        # Schedule retry with exponential backoff + jitter
                        import random
                        backoff = min(
                            self.DEFAULT_BACKOFF_BASE * (2 ** (attempts - 1)),
                            self.DEFAULT_BACKOFF_MAX
                        )
                        jitter = random.uniform(0, backoff * 0.1)
                        next_attempt = now + backoff + jitter
                        
                        conn.execute("""
                            UPDATE messages 
                            SET status = 'pending',
                                attempts = ?,
                                scheduled_at = ?,
                                last_error = ?,
                                updated_at = ?,
                                ack_token = NULL
                            WHERE id = ?
                        """, (attempts, next_attempt, error, now, message_id))
                        
                        logger.debug(f"Message {message_id} scheduled for retry in {backoff:.0f}s")
                    
                    self._stats["failed"] += 1
                    self._circuit_breaker.record_failure(error)
                
                return True
                
            except Exception as e:
                logger.error(f"Failed to nack message: {e}")
                return False
    
    def _move_to_dlq(self, conn: sqlite3.Connection, row: sqlite3.Row, error: str):
        """Move a message to the dead letter queue."""
        now = time.time()
        dlq_id = f"dlq_{row['id']}_{int(now)}"
        
        conn.execute("""
            INSERT INTO dead_letter_queue 
            (id, original_id, topic, payload, attempts, last_error, created_at, dead_lettered_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            dlq_id,
            row['id'],
            row['topic'],
            row['payload'],
            row['attempts'] + 1,
            error,
            row['created_at'],
            now,
            row['metadata']
        ))
        
        conn.execute("DELETE FROM messages WHERE id = ?", (row['id'],))
        logger.warning(f"Message {row['id']} moved to dead letter queue after {row['attempts'] + 1} attempts")
    
    def get_dead_letter_messages(
        self,
        topic: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get messages from the dead letter queue."""
        messages = []
        
        try:
            with self._get_connection() as conn:
                if topic:
                    rows = conn.execute(
                        "SELECT * FROM dead_letter_queue WHERE topic = ? ORDER BY dead_lettered_at DESC LIMIT ?",
                        (topic, limit)
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT * FROM dead_letter_queue ORDER BY dead_lettered_at DESC LIMIT ?",
                        (limit,)
                    ).fetchall()
                
                for row in rows:
                    messages.append({
                        "id": row['id'],
                        "original_id": row['original_id'],
                        "topic": row['topic'],
                        "payload": json.loads(row['payload']),
                        "attempts": row['attempts'],
                        "last_error": row['last_error'],
                        "created_at": row['created_at'],
                        "dead_lettered_at": row['dead_lettered_at'],
                        "metadata": json.loads(row['metadata'] or '{}')
                    })
                    
        except Exception as e:
            logger.error(f"Failed to get DLQ messages: {e}")
        
        return messages
    
    def replay_dead_letter(self, dlq_id: str) -> Optional[str]:
        """Replay a message from the dead letter queue."""
        with self._lock:
            try:
                with self._get_connection() as conn:
                    row = conn.execute(
                        "SELECT * FROM dead_letter_queue WHERE id = ?",
                        (dlq_id,)
                    ).fetchone()
                    
                    if not row:
                        return None
                    
                    # Re-publish with new ID
                    new_id = self.publish(
                        topic=row['topic'],
                        payload=json.loads(row['payload']),
                        metadata={
                            **json.loads(row['metadata'] or '{}'),
                            "replayed_from": dlq_id,
                            "original_id": row['original_id']
                        }
                    )
                    
                    if new_id:
                        conn.execute("DELETE FROM dead_letter_queue WHERE id = ?", (dlq_id,))
                        logger.info(f"Replayed DLQ message {dlq_id} as {new_id}")
                    
                    return new_id
                    
            except Exception as e:
                logger.error(f"Failed to replay DLQ message: {e}")
                return None
    
    def get_stats(self) -> Dict[str, Any]:
        """Get broker statistics."""
        stats = {
            "initialized": self._initialized,
            "path": str(self.db_path),
            "circuit_breaker": self._circuit_breaker.get_stats(),
            **self._stats
        }
        
        try:
            with self._get_connection() as conn:
                for status in ['pending', 'in_flight']:
                    count = conn.execute(
                        "SELECT COUNT(*) FROM messages WHERE status = ?",
                        (status,)
                    ).fetchone()[0]
                    stats[f"queue_{status}"] = count
                
                dlq_count = conn.execute(
                    "SELECT COUNT(*) FROM dead_letter_queue"
                ).fetchone()[0]
                stats["dead_letter_queue"] = dlq_count
                
        except Exception as e:
            logger.error(f"Failed to get broker stats: {e}")
        
        return stats
    
    def cleanup_expired(self) -> int:
        """Remove expired messages."""
        now = time.time()
        deleted = 0
        
        with self._lock:
            try:
                with self._get_connection() as conn:
                    result = conn.execute(
                        "DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at < ?",
                        (now,)
                    )
                    deleted = result.rowcount
                    
                    if deleted > 0:
                        logger.info(f"Cleaned up {deleted} expired messages")
                        
            except Exception as e:
                logger.error(f"Failed to cleanup expired messages: {e}")
        
        return deleted
    
    def cleanup_old_ack_logs(self, days: int = 7) -> int:
        """Remove old acknowledgment logs."""
        cutoff = time.time() - (days * 86400)
        deleted = 0
        
        with self._lock:
            try:
                with self._get_connection() as conn:
                    result = conn.execute(
                        "DELETE FROM ack_log WHERE timestamp < ?",
                        (cutoff,)
                    )
                    deleted = result.rowcount
                    
            except Exception as e:
                logger.error(f"Failed to cleanup ack logs: {e}")
        
        return deleted
