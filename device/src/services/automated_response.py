#!/usr/bin/env python3
"""
Automated Response Service

Provides intelligent, automated responses to wildlife detections.
Handles photo/video capture, GPS tagging, priority-based uploads, and custom actions.
"""

import time
import logging
import threading
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, timedelta
from pathlib import Path
import json

logger = logging.getLogger(__name__)


class AutomatedResponseService:
    """
    Automated response system for wildlife detections.

    Features:
    - Priority-based animal classification
    - Automated photo burst capture
    - Video recording
    - GPS location tagging
    - Sound alerts
    - Priority-based upload scheduling
    - Time-based response profiles (day/night)
    - Configurable actions per animal class
    - Cooldown periods
    """

    # Animal priorities
    PRIORITY_CRITICAL = "critical"  # Bears, elephants, tigers
    PRIORITY_HIGH = "high"  # Leopards, wolves
    PRIORITY_MEDIUM = "medium"  # Deer, monkeys
    PRIORITY_LOW = "low"  # Small animals

    def __init__(
        self, config: dict, image_store: Any, upload_service: Any, event_logger: Any
    ):
        """
        Initialize automated response service.

        Args:
            config: Configuration dictionary
            image_store: Image storage service
            upload_service: Upload service for priority uploads
            event_logger: Event logger for audit trail
        """
        self.config = config
        self.image_store = image_store
        self.upload_service = upload_service
        self.event_logger = event_logger

        # Priority class mappings
        self.class_priorities = self._init_class_priorities()

        # Response configurations
        self.response_configs = self._init_response_configs()

        # Cooldown tracking
        self.last_detection_times: Dict[int, datetime] = {}
        self.cooldown_lock = threading.Lock()

        # Statistics
        self.stats = {
            "total_responses": 0,
            "responses_by_priority": {
                self.PRIORITY_CRITICAL: 0,
                self.PRIORITY_HIGH: 0,
                self.PRIORITY_MEDIUM: 0,
                self.PRIORITY_LOW: 0,
            },
            "photos_captured": 0,
            "videos_recorded": 0,
            "alerts_sent": 0,
        }

        # Callbacks
        self.alert_callbacks: List[Callable] = []

    def _init_class_priorities(self) -> Dict[int, str]:
        """Initialize animal class to priority mappings."""
        priorities = {}

        # Get from config or use defaults
        config_priorities = self.config.get("detection_automation", {}).get(
            "priority_classes", {}
        )

        # Critical animals (immediate threat)
        for class_id in config_priorities.get(
            "critical", [15, 16, 17, 18, 19, 83, 84, 85]
        ):
            priorities[class_id] = self.PRIORITY_CRITICAL

        # High priority
        for class_id in config_priorities.get("high", [20, 21, 22, 86, 87]):
            priorities[class_id] = self.PRIORITY_HIGH

        # Medium priority
        for class_id in config_priorities.get("medium", [88, 89, 90]):
            priorities[class_id] = self.PRIORITY_MEDIUM

        # Low priority
        for class_id in config_priorities.get("low", [91, 92]):
            priorities[class_id] = self.PRIORITY_LOW

        return priorities

    def _init_response_configs(self) -> Dict[str, Dict]:
        """Initialize response configurations per priority level."""
        auto_actions = self.config.get("detection_automation", {}).get(
            "automated_actions", {}
        )
        upload_rules = self.config.get("detection_automation", {}).get(
            "upload_rules", {}
        )

        return {
            self.PRIORITY_CRITICAL: {
                "capture_burst": auto_actions.get("capture_burst_photos", True),
                "burst_count": auto_actions.get("burst_count", 5),
                "record_video": auto_actions.get("record_video", True),
                "video_duration": auto_actions.get("video_duration_seconds", 10),
                "gps_tagging": auto_actions.get("gps_tagging", True),
                "sound_alert": auto_actions.get("sound_alert", False),
                "upload_immediate": upload_rules.get("critical_immediate", True),
                "cooldown_seconds": 30,  # Short cooldown for critical
            },
            self.PRIORITY_HIGH: {
                "capture_burst": True,
                "burst_count": 3,
                "record_video": True,
                "video_duration": 5,
                "gps_tagging": True,
                "sound_alert": False,
                "upload_delay_seconds": upload_rules.get("high_delay_seconds", 60),
                "cooldown_seconds": 60,
            },
            self.PRIORITY_MEDIUM: {
                "capture_burst": True,
                "burst_count": 1,
                "record_video": False,
                "gps_tagging": True,
                "sound_alert": False,
                "batch_upload_minutes": upload_rules.get("medium_batch_minutes", 5),
                "cooldown_seconds": 120,
            },
            self.PRIORITY_LOW: {
                "capture_burst": False,
                "record_video": False,
                "gps_tagging": False,
                "sound_alert": False,
                "daily_summary": upload_rules.get("low_daily_summary", True),
                "cooldown_seconds": 300,
            },
        }

    def handle_detection(self, detection: Dict) -> Dict[str, Any]:
        """
        Handle a wildlife detection with automated response.

        Args:
            detection: Detection dictionary with class_id, confidence, etc.

        Returns:
            dict: Response actions taken
        """
        class_id = detection.get("class_id")
        class_name = detection.get("class_name", f"class_{class_id}")
        confidence = detection.get("confidence", 0.0)

        # Get priority level
        priority = self.class_priorities.get(class_id, self.PRIORITY_LOW)

        # Check cooldown
        if not self._check_cooldown(class_id, priority):
            logger.debug(f"Detection {class_name} in cooldown period, skipping")
            return {"skipped": True, "reason": "cooldown"}

        logger.info(
            f"Wildlife detection: {class_name} (priority: {priority}, "
            f"confidence: {confidence:.2f})"
        )

        # Get response configuration
        config = self.response_configs[priority]

        # Execute response actions
        response = {
            "detection": detection,
            "priority": priority,
            "timestamp": datetime.now().isoformat(),
            "actions": {},
        }

        # Capture burst photos
        if config.get("capture_burst"):
            photos = self._capture_burst_photos(
                detection, count=config.get("burst_count", 1)
            )
            response["actions"]["photos"] = photos
            self.stats["photos_captured"] += len(photos)

        # Record video
        if config.get("record_video"):
            video = self._record_video(
                detection, duration=config.get("video_duration", 5)
            )
            response["actions"]["video"] = video
            if video:
                self.stats["videos_recorded"] += 1

        # Add GPS tagging
        if config.get("gps_tagging"):
            gps_data = self._get_gps_location()
            response["actions"]["gps"] = gps_data

        # Sound alert
        if config.get("sound_alert"):
            self._trigger_sound_alert(priority)
            response["actions"]["sound_alert"] = True

        # Schedule upload based on priority
        self._schedule_upload(detection, response, config)

        # Send alerts
        self._send_alert(detection, priority, response)

        # Update statistics
        self.stats["total_responses"] += 1
        self.stats["responses_by_priority"][priority] += 1

        # Update cooldown
        self._update_cooldown(class_id)

        # Log event
        if self.event_logger:
            self.event_logger.log_detection(detection, response)

        return response

    def _check_cooldown(self, class_id: int, priority: str) -> bool:
        """Check if detection is in cooldown period."""
        with self.cooldown_lock:
            if class_id not in self.last_detection_times:
                return True

            last_time = self.last_detection_times[class_id]
            cooldown_seconds = self.response_configs[priority]["cooldown_seconds"]

            time_since = datetime.now() - last_time
            return time_since.total_seconds() >= cooldown_seconds

    def _update_cooldown(self, class_id: int):
        """Update last detection time for cooldown."""
        with self.cooldown_lock:
            self.last_detection_times[class_id] = datetime.now()

    def _capture_burst_photos(self, detection: Dict, count: int) -> List[str]:
        """Capture burst of photos."""
        photos = []

        try:
            for i in range(count):
                # In real implementation, this would capture from camera
                # For now, we'll use the detection image if available
                image_path = detection.get("image_path")
                if image_path:
                    # Save additional copies or trigger camera capture
                    photos.append(image_path)

                # Small delay between captures
                if i < count - 1:
                    time.sleep(0.2)

        except Exception as e:
            logger.error(f"Error capturing burst photos: {e}")

        return photos

    def _record_video(self, detection: Dict, duration: int) -> Optional[str]:
        """Record video clip."""
        try:
            # In real implementation, this would start video recording
            # Return path to recorded video
            logger.info(f"Recording {duration}s video clip")
            return None  # Placeholder
        except Exception as e:
            logger.error(f"Error recording video: {e}")
            return None

    def _get_gps_location(self) -> Optional[Dict]:
        """Get current GPS location."""
        try:
            # In real implementation, this would read from GPS module
            # For now, return configured location
            return {
                "latitude": self.config.get("device", {}).get("latitude", 0.0),
                "longitude": self.config.get("device", {}).get("longitude", 0.0),
                "accuracy": 10.0,
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"Error getting GPS location: {e}")
            return None

    def _trigger_sound_alert(self, priority: str):
        """Trigger sound alert (buzzer/speaker)."""
        try:
            # In real implementation, this would activate GPIO pin or speaker
            logger.info(f"Sound alert triggered for {priority} priority detection")
        except Exception as e:
            logger.error(f"Error triggering sound alert: {e}")

    def _schedule_upload(self, detection: Dict, response: Dict, config: Dict):
        """Schedule upload based on priority."""
        if not self.upload_service:
            return

        try:
            # Immediate upload for critical
            if config.get("upload_immediate"):
                logger.info("Scheduling immediate upload (critical priority)")
                # Upload immediately via upload service
                # upload_service.upload_now(detection, response)

            # Delayed upload for high priority
            elif "upload_delay_seconds" in config:
                delay = config["upload_delay_seconds"]
                logger.info(f"Scheduling upload with {delay}s delay (high priority)")
                # Upload service will handle delay

            # Batch upload for medium priority
            elif "batch_upload_minutes" in config:
                minutes = config["batch_upload_minutes"]
                logger.info(f"Scheduling batch upload ({minutes}min) (medium priority)")

            # Daily summary for low priority
            elif config.get("daily_summary"):
                logger.info("Adding to daily summary (low priority)")

        except Exception as e:
            logger.error(f"Error scheduling upload: {e}")

    def _send_alert(self, detection: Dict, priority: str, response: Dict):
        """Send alert to registered callbacks."""
        alert = {
            "type": "wildlife_detection",
            "priority": priority,
            "detection": detection,
            "response": response,
            "timestamp": datetime.now().isoformat(),
        }

        for callback in self.alert_callbacks:
            try:
                callback(alert)
                self.stats["alerts_sent"] += 1
            except Exception as e:
                logger.error(f"Error in alert callback: {e}")

    def add_alert_callback(self, callback: Callable[[Dict], None]):
        """Register callback for alerts."""
        self.alert_callbacks.append(callback)

    def get_priority_for_class(self, class_id: int) -> str:
        """Get priority level for an animal class."""
        return self.class_priorities.get(class_id, self.PRIORITY_LOW)

    def get_stats(self) -> Dict[str, Any]:
        """Get service statistics."""
        return {
            **self.stats,
            "active_cooldowns": len(self.last_detection_times),
            "alert_callbacks_registered": len(self.alert_callbacks),
        }

    def update_configuration(self, new_config: Dict):
        """Update service configuration dynamically."""
        try:
            # Update priority mappings if provided
            if "priority_classes" in new_config:
                self.class_priorities = self._init_class_priorities()
                logger.info("Updated priority class mappings")

            # Update response configs if provided
            if "automated_actions" in new_config or "upload_rules" in new_config:
                self.response_configs = self._init_response_configs()
                logger.info("Updated response configurations")

        except Exception as e:
            logger.error(f"Error updating configuration: {e}")
