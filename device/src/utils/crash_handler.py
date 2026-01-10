#!/usr/bin/env python3
"""
Crash Handler Module

Provides comprehensive crash handling, recovery, and reporting for the OPTIC-SHIELD system.
"""

import os
import sys
import logging
import traceback
import json
import threading
from typing import Dict, Optional, Any, Callable
from datetime import datetime
from pathlib import Path
import signal

logger = logging.getLogger(__name__)


class CrashHandler:
    """
    Centralized crash handling and recovery system.

    Features:
    - Global exception handler
    - Crash report generation with full system state
    - Automatic crash report upload
    - Service-specific recovery strategies
    - Graceful degradation modes
    """

    def __init__(
        self, crash_dir: str, device_id: str, upload_callback: Optional[Callable] = None
    ):
        """
        Initialize crash handler.

        Args:
            crash_dir: Directory to store crash reports
            device_id: Device identifier
            upload_callback: Optional callback to upload crash reports
        """
        self.crash_dir = Path(crash_dir)
        self.crash_dir.mkdir(parents=True, exist_ok=True)

        self.device_id = device_id
        self.upload_callback = upload_callback

        # Crash statistics
        self.stats = {
            "total_crashes": 0,
            "crashes_by_service": {},
            "last_crash_time": None,
        }

        # Recovery strategies
        self.recovery_strategies: Dict[str, Callable] = {}

        # Original exception hook
        self.original_excepthook = sys.excepthook

    def install(self):
        """Install global exception handler."""
        sys.excepthook = self._handle_uncaught_exception

        # Handle signals for graceful shutdown
        signal.signal(signal.SIGTERM, self._handle_signal)
        signal.signal(signal.SIGINT, self._handle_signal)

        logger.info("Crash handler installed")

    def _handle_signal(self, signum, frame):
        """Handle termination signals."""
        logger.info(f"Received signal {signum}, initiating graceful shutdown")
        # Let the signal propagate
        if self.original_excepthook:
            sys.exit(0)

    def _handle_uncaught_exception(self, exc_type, exc_value, exc_traceback):
        """Handle uncaught exceptions."""
        if issubclass(exc_type, KeyboardInterrupt):
            # Call original handler for KeyboardInterrupt
            self.original_excepthook(exc_type, exc_value, exc_traceback)
            return

        logger.critical(
            "Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback)
        )

        # Generate crash report
        crash_report = self.generate_crash_report(
            exc_type=exc_type,
            exc_value=exc_value,
            exc_traceback=exc_traceback,
            service_name="main",
            context={},
        )

        # Save and upload
        self._save_crash_report(crash_report)
        self._upload_crash_report(crash_report)

        # Call original handler
        self.original_excepthook(exc_type, exc_value, exc_traceback)

    def handle_service_crash(
        self, service_name: str, exception: Exception, context: Optional[Dict] = None
    ) -> bool:
        """
        Handle a service crash.

        Args:
            service_name: Name of the crashed service
            exception: The exception that caused the crash
            context: Additional context about the crash

        Returns:
            bool: True if recovery was successful
        """
        logger.error(f"Service crash: {service_name}", exc_info=exception)

        # Generate crash report
        crash_report = self.generate_crash_report(
            exc_type=type(exception),
            exc_value=exception,
            exc_traceback=exception.__traceback__,
            service_name=service_name,
            context=context or {},
        )

        # Save and upload
        self._save_crash_report(crash_report)
        self._upload_crash_report(crash_report)

        # Update statistics
        self.stats["total_crashes"] += 1
        self.stats["crashes_by_service"][service_name] = (
            self.stats["crashes_by_service"].get(service_name, 0) + 1
        )
        self.stats["last_crash_time"] = datetime.now().isoformat()

        # Attempt recovery
        if service_name in self.recovery_strategies:
            try:
                logger.info(f"Attempting recovery for {service_name}")
                recovery_fn = self.recovery_strategies[service_name]
                return recovery_fn(exception, context)
            except Exception as e:
                logger.error(f"Recovery failed: {e}", exc_info=True)
                return False

        return False

    def generate_crash_report(
        self,
        exc_type: type,
        exc_value: Exception,
        exc_traceback: Any,
        service_name: str,
        context: Dict,
    ) -> Dict:
        """Generate comprehensive crash report."""
        # Get stack trace
        tb_lines = traceback.format_exception(exc_type, exc_value, exc_traceback)
        stack_trace = "".join(tb_lines)

        # Get system state
        system_state = self._get_system_state()

        # Get thread info
        thread_info = self._get_thread_info()

        report = {
            "crash_id": self._generate_crash_id(),
            "timestamp": datetime.now().isoformat(),
            "device_id": self.device_id,
            "service_name": service_name,
            "exception": {
                "type": exc_type.__name__,
                "message": str(exc_value),
                "stack_trace": stack_trace,
            },
            "context": context,
            "system_state": system_state,
            "thread_info": thread_info,
            "stats": self.stats.copy(),
        }

        return report

    def _generate_crash_id(self) -> str:
        """Generate unique crash ID."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"crash_{self.device_id}_{timestamp}"

    def _get_system_state(self) -> Dict:
        """Get current system state."""
        try:
            import psutil

            return {
                "cpu_percent": psutil.cpu_percent(),
                "memory_percent": psutil.virtual_memory().percent,
                "disk_usage": psutil.disk_usage("/").percent,
                "process_count": len(psutil.pids()),
                "uptime_seconds": None,  # Can be filled from telemetry
            }
        except Exception as e:
            logger.debug(f"Error getting system state: {e}")
            return {}

    def _get_thread_info(self) -> Dict:
        """Get information about running threads."""
        threads = []
        for thread in threading.enumerate():
            threads.append(
                {
                    "name": thread.name,
                    "daemon": thread.daemon,
                    "alive": thread.is_alive(),
                    "ident": thread.ident,
                }
            )

        return {"count": threading.active_count(), "threads": threads}

    def _save_crash_report(self, report: Dict) -> Path:
        """Save crash report to disk."""
        try:
            filename = f"{report['crash_id']}.json"
            filepath = self.crash_dir / filename

            with open(filepath, "w") as f:
                json.dump(report, f, indent=2)

            logger.info(f"Crash report saved: {filepath}")
            return filepath

        except Exception as e:
            logger.error(f"Failed to save crash report: {e}")
            return None

    def _upload_crash_report(self, report: Dict):
        """Upload crash report to dashboard."""
        if self.upload_callback:
            try:
                self.upload_callback(report)
                logger.info(f"Crash report uploaded: {report['crash_id']}")
            except Exception as e:
                logger.error(f"Failed to upload crash report: {e}")

    def register_recovery_strategy(
        self, service_name: str, recovery_fn: Callable[[Exception, Dict], bool]
    ):
        """
        Register a recovery strategy for a service.

        Args:
            service_name: Service identifier
            recovery_fn: Function that attempts recovery, returns success bool
        """
        self.recovery_strategies[service_name] = recovery_fn
        logger.info(f"Recovery strategy registered for: {service_name}")

    def get_crash_reports(self, limit: int = 50) -> list:
        """Get recent crash reports."""
        reports = []

        try:
            crash_files = sorted(
                self.crash_dir.glob("crash_*.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )[:limit]

            for crash_file in crash_files:
                try:
                    with open(crash_file, "r") as f:
                        report = json.load(f)
                        reports.append(report)
                except Exception as e:
                    logger.error(f"Error reading crash report {crash_file}: {e}")

        except Exception as e:
            logger.error(f"Error listing crash reports: {e}")

        return reports

    def cleanup_old_reports(self, days: int = 30):
        """Delete crash reports older than specified days."""
        try:
            import time

            cutoff_time = time.time() - (days * 86400)
            deleted_count = 0

            for crash_file in self.crash_dir.glob("crash_*.json"):
                if crash_file.stat().st_mtime < cutoff_time:
                    crash_file.unlink()
                    deleted_count += 1

            if deleted_count > 0:
                logger.info(f"Deleted {deleted_count} old crash reports")

        except Exception as e:
            logger.error(f"Error cleaning up crash reports: {e}")

    def get_stats(self) -> Dict:
        """Get crash handler statistics."""
        return {
            **self.stats,
            "crash_reports_stored": len(list(self.crash_dir.glob("crash_*.json"))),
            "recovery_strategies_registered": len(self.recovery_strategies),
        }


# Recovery strategy helpers
class RecoveryStrategies:
    """Common recovery strategies for services."""

    @staticmethod
    def camera_recovery(exception: Exception, context: Dict) -> bool:
        """Recover from camera failures."""
        logger.info("Attempting camera recovery")
        # Strategy: Try USB camera fallback
        # This would be implemented by the calling service
        return False

    @staticmethod
    def model_recovery(exception: Exception, context: Dict) -> bool:
        """Recover from model loading failures."""
        logger.info("Attempting model recovery")
        # Strategy: Use fallback model
        return False

    @staticmethod
    def network_recovery(exception: Exception, context: Dict) -> bool:
        """Recover from network failures."""
        logger.info("Attempting network recovery")
        # Strategy: Enable offline queue mode
        return True  # Can continue without network

    @staticmethod
    def storage_recovery(exception: Exception, context: Dict) -> bool:
        """Recover from storage failures."""
        logger.info("Attempting storage recovery")
        # Strategy: Clean up old data
        return False

    @staticmethod
    def memory_recovery(exception: Exception, context: Dict) -> bool:
        """Recover from memory exhaustion."""
        logger.info("Attempting memory recovery")
        # Strategy: Trigger garbage collection and restart service
        import gc

        gc.collect()
        return False
