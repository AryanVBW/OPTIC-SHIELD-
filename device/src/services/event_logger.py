"""
Detection event logger for auditing and analysis.
Provides structured logging of all detection events.
"""

import logging
import json
import time
import threading
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class EventType(Enum):
    DETECTION = "detection"
    UPLOAD_STARTED = "upload_started"
    UPLOAD_SUCCESS = "upload_success"
    UPLOAD_FAILED = "upload_failed"
    UPLOAD_RETRY = "upload_retry"
    DEVICE_STATUS = "device_status"
    CAMERA_CAPTURE = "camera_capture"
    SYSTEM_ERROR = "system_error"


@dataclass
class DetectionEventLog:
    """Structured detection event log entry."""
    event_id: str
    event_type: str
    timestamp: float
    device_id: str
    camera_id: Optional[str]
    class_name: Optional[str]
    confidence: Optional[float]
    bbox: Optional[List[int]]
    image_path: Optional[str]
    location: Optional[Dict[str, Any]]
    metadata: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    def to_json(self) -> str:
        return json.dumps(self.to_dict())


class EventLogger:
    """
    Structured event logger for detection events.
    
    Features:
    - JSON-formatted log files for easy parsing
    - Daily log rotation
    - Configurable retention
    - Thread-safe operation
    """
    
    def __init__(
        self,
        log_dir: str,
        device_id: str,
        retention_days: int = 30,
        max_file_size_mb: int = 50
    ):
        self.log_dir = Path(log_dir)
        self.device_id = device_id
        self.retention_days = retention_days
        self.max_file_size_mb = max_file_size_mb
        self._lock = threading.Lock()
        self._current_file: Optional[Path] = None
        self._current_date: Optional[str] = None
        self._event_count = 0
    
    def initialize(self) -> bool:
        """Initialize the event logger."""
        try:
            self.log_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"Event logger initialized: {self.log_dir}")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize event logger: {e}")
            return False
    
    def _get_log_file(self) -> Path:
        """Get current log file, rotating if needed."""
        today = datetime.now().strftime("%Y-%m-%d")
        
        if self._current_date != today:
            self._current_date = today
            self._current_file = self.log_dir / f"events_{today}.jsonl"
        
        # Check file size and rotate if needed
        if self._current_file.exists():
            size_mb = self._current_file.stat().st_size / (1024 * 1024)
            if size_mb >= self.max_file_size_mb:
                # Create numbered rotation
                i = 1
                while True:
                    rotated = self.log_dir / f"events_{today}_{i}.jsonl"
                    if not rotated.exists():
                        self._current_file = rotated
                        break
                    i += 1
        
        return self._current_file
    
    def log_detection(
        self,
        event_id: str,
        class_name: str,
        confidence: float,
        bbox: List[int],
        camera_id: str,
        image_path: Optional[str] = None,
        location: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Log a detection event."""
        event = DetectionEventLog(
            event_id=event_id,
            event_type=EventType.DETECTION.value,
            timestamp=time.time(),
            device_id=self.device_id,
            camera_id=camera_id,
            class_name=class_name,
            confidence=confidence,
            bbox=bbox,
            image_path=image_path,
            location=location,
            metadata=metadata or {}
        )
        self._write_event(event)
    
    def log_upload_started(
        self,
        event_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Log upload start event."""
        event = DetectionEventLog(
            event_id=event_id,
            event_type=EventType.UPLOAD_STARTED.value,
            timestamp=time.time(),
            device_id=self.device_id,
            camera_id=None,
            class_name=None,
            confidence=None,
            bbox=None,
            image_path=None,
            location=None,
            metadata=metadata or {}
        )
        self._write_event(event)
    
    def log_upload_success(
        self,
        event_id: str,
        response: Optional[Dict[str, Any]] = None
    ):
        """Log successful upload."""
        event = DetectionEventLog(
            event_id=event_id,
            event_type=EventType.UPLOAD_SUCCESS.value,
            timestamp=time.time(),
            device_id=self.device_id,
            camera_id=None,
            class_name=None,
            confidence=None,
            bbox=None,
            image_path=None,
            location=None,
            metadata={"response": response} if response else {}
        )
        self._write_event(event)
    
    def log_upload_failed(
        self,
        event_id: str,
        error: str,
        attempt: int = 1
    ):
        """Log failed upload attempt."""
        event = DetectionEventLog(
            event_id=event_id,
            event_type=EventType.UPLOAD_FAILED.value,
            timestamp=time.time(),
            device_id=self.device_id,
            camera_id=None,
            class_name=None,
            confidence=None,
            bbox=None,
            image_path=None,
            location=None,
            metadata={"error": error, "attempt": attempt}
        )
        self._write_event(event)
    
    def log_upload_retry(
        self,
        event_id: str,
        attempt: int,
        next_retry_seconds: float
    ):
        """Log retry scheduling."""
        event = DetectionEventLog(
            event_id=event_id,
            event_type=EventType.UPLOAD_RETRY.value,
            timestamp=time.time(),
            device_id=self.device_id,
            camera_id=None,
            class_name=None,
            confidence=None,
            bbox=None,
            image_path=None,
            location=None,
            metadata={
                "attempt": attempt,
                "next_retry_seconds": next_retry_seconds
            }
        )
        self._write_event(event)
    
    def log_camera_capture(
        self,
        camera_id: str,
        image_path: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Log camera capture event."""
        event = DetectionEventLog(
            event_id=f"capture_{int(time.time() * 1000)}",
            event_type=EventType.CAMERA_CAPTURE.value,
            timestamp=time.time(),
            device_id=self.device_id,
            camera_id=camera_id,
            class_name=None,
            confidence=None,
            bbox=None,
            image_path=image_path,
            location=None,
            metadata=metadata or {}
        )
        self._write_event(event)
    
    def log_system_error(
        self,
        error: str,
        component: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Log system error."""
        event = DetectionEventLog(
            event_id=f"error_{int(time.time() * 1000)}",
            event_type=EventType.SYSTEM_ERROR.value,
            timestamp=time.time(),
            device_id=self.device_id,
            camera_id=None,
            class_name=None,
            confidence=None,
            bbox=None,
            image_path=None,
            location=None,
            metadata={
                "error": error,
                "component": component,
                **(metadata or {})
            }
        )
        self._write_event(event)
    
    def _write_event(self, event: DetectionEventLog):
        """Write event to log file."""
        with self._lock:
            try:
                log_file = self._get_log_file()
                with open(log_file, 'a') as f:
                    f.write(event.to_json() + '\n')
                self._event_count += 1
            except Exception as e:
                logger.error(f"Failed to write event log: {e}")
    
    def get_events(
        self,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        event_type: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Query events from log files.
        
        Args:
            start_time: Filter events after this timestamp
            end_time: Filter events before this timestamp
            event_type: Filter by event type
            limit: Maximum events to return
        """
        events = []
        
        try:
            log_files = sorted(self.log_dir.glob("events_*.jsonl"), reverse=True)
            
            for log_file in log_files:
                if len(events) >= limit:
                    break
                
                with open(log_file, 'r') as f:
                    for line in f:
                        if len(events) >= limit:
                            break
                        
                        try:
                            event = json.loads(line.strip())
                            
                            # Apply filters
                            if start_time and event.get('timestamp', 0) < start_time:
                                continue
                            if end_time and event.get('timestamp', 0) > end_time:
                                continue
                            if event_type and event.get('event_type') != event_type:
                                continue
                            
                            events.append(event)
                        except json.JSONDecodeError:
                            continue
                            
        except Exception as e:
            logger.error(f"Failed to read event logs: {e}")
        
        return events
    
    def cleanup_old_logs(self) -> int:
        """Remove log files older than retention period."""
        deleted = 0
        cutoff = time.time() - (self.retention_days * 86400)
        
        try:
            for log_file in self.log_dir.glob("events_*.jsonl"):
                if log_file.stat().st_mtime < cutoff:
                    log_file.unlink()
                    deleted += 1
            
            if deleted > 0:
                logger.info(f"Cleaned up {deleted} old event log files")
                
        except Exception as e:
            logger.error(f"Failed to cleanup old logs: {e}")
        
        return deleted
    
    def get_stats(self) -> Dict[str, Any]:
        """Get logger statistics."""
        total_size = 0
        file_count = 0
        
        try:
            for log_file in self.log_dir.glob("events_*.jsonl"):
                total_size += log_file.stat().st_size
                file_count += 1
        except Exception:
            pass
        
        return {
            "log_dir": str(self.log_dir),
            "device_id": self.device_id,
            "event_count": self._event_count,
            "file_count": file_count,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "retention_days": self.retention_days
        }
