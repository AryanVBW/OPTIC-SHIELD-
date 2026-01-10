#!/usr/bin/env python3
"""
Watchdog Service

Integrates with Linux hardware watchdog for ultimate system reliability.
Ensures system resets if it becomes unresponsive.
"""

import os
import time
import logging
import threading
from typing import Optional, Callable, Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)


class WatchdogService:
    """
    Hardware watchdog integration for system reliability.

    Features:
    - Interfaces with /dev/watchdog device
    - Heartbeat mechanism (kicks watchdog regularly)
    - Monitors critical services
    - Forces hard reset if system hangs
    - Configurable timeout
    """

    WATCHDOG_DEVICE = "/dev/watchdog"
    MAGIC_CLOSE_CHAR = "V"

    def __init__(
        self,
        timeout_seconds: int = 30,
        heartbeat_interval: int = 10,
        service_check_callback: Optional[Callable] = None,
    ):
        """
        Initialize watchdog service.

        Args:
            timeout_seconds: Watchdog timeout (system resets if not kicked)
            heartbeat_interval: Seconds between heartbeats
            service_check_callback: Optional callback to check service health
        """
        self.timeout_seconds = timeout_seconds
        self.heartbeat_interval = heartbeat_interval
        self.service_check_callback = service_check_callback

        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.watchdog_fd: Optional[int] = None

        # Statistics
        self.stats = {
            "heartbeats_sent": 0,
            "service_checks_failed": 0,
            "start_time": None,
            "enabled": False,
        }

        # Check if watchdog is available
        self.available = os.path.exists(self.WATCHDOG_DEVICE)
        if not self.available:
            logger.warning(f"Watchdog device not found: {self.WATCHDOG_DEVICE}")

    def start(self):
        """Start watchdog service."""
        if not self.available:
            logger.warning("Watchdog not available, skipping")
            return

        if self.running:
            logger.warning("Watchdog service already running")
            return

        try:
            # Open watchdog device
            self.watchdog_fd = os.open(self.WATCHDOG_DEVICE, os.O_WRONLY)

            logger.info(f"Watchdog device opened: {self.WATCHDOG_DEVICE}")
            logger.info(
                f"Timeout: {self.timeout_seconds}s, Heartbeat: {self.heartbeat_interval}s"
            )

            # Set timeout if supported
            try:
                import fcntl

                WDIOC_SETTIMEOUT = 0x80045706
                fcntl.ioctl(self.watchdog_fd, WDIOC_SETTIMEOUT, self.timeout_seconds)
                logger.info(f"Watchdog timeout set to {self.timeout_seconds}s")
            except Exception as e:
                logger.warning(f"Could not set watchdog timeout: {e}")

            self.running = True
            self.stats["enabled"] = True
            self.stats["start_time"] = time.time()

            # Start heartbeat thread
            self.thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
            self.thread.start()

            logger.info("Watchdog service started")

        except Exception as e:
            logger.error(f"Failed to start watchdog: {e}", exc_info=True)
            if self.watchdog_fd:
                self._close_watchdog()

    def stop(self):
        """Stop watchdog service gracefully."""
        if not self.running:
            return

        logger.info("Stopping watchdog service")
        self.running = False

        # Wait for thread
        if self.thread:
            self.thread.join(timeout=5)

        # Properly close watchdog to prevent reboot
        self._close_watchdog()

        self.stats["enabled"] = False
        logger.info("Watchdog service stopped")

    def _heartbeat_loop(self):
        """Main heartbeat loop."""
        logger.info("Watchdog heartbeat loop started")

        while self.running:
            try:
                # Check service health if callback provided
                services_healthy = True
                if self.service_check_callback:
                    try:
                        services_healthy = self.service_check_callback()
                    except Exception as e:
                        logger.error(f"Service check failed: {e}")
                        services_healthy = False
                        self.stats["service_checks_failed"] += 1

                # Only kick watchdog if services are healthy
                if services_healthy:
                    self._kick_watchdog()
                else:
                    logger.warning("Services unhealthy, not kicking watchdog")
                    # System will reset if services don't recover

                time.sleep(self.heartbeat_interval)

            except Exception as e:
                logger.error(f"Error in watchdog heartbeat: {e}", exc_info=True)
                time.sleep(self.heartbeat_interval)

    def _kick_watchdog(self):
        """Send keepalive to watchdog."""
        if self.watchdog_fd is None:
            return

        try:
            # Write to watchdog device to reset timer
            os.write(self.watchdog_fd, b"1")
            self.stats["heartbeats_sent"] += 1

            # Log periodically, not every heartbeat
            if self.stats["heartbeats_sent"] % 10 == 0:
                logger.debug(f"Watchdog kicked ({self.stats['heartbeats_sent']} total)")

        except Exception as e:
            logger.error(f"Failed to kick watchdog: {e}")

    def _close_watchdog(self):
        """Properly close watchdog device."""
        if self.watchdog_fd is None:
            return

        try:
            # Write magic character to disable watchdog
            os.write(self.watchdog_fd, self.MAGIC_CLOSE_CHAR.encode())
            os.close(self.watchdog_fd)
            self.watchdog_fd = None
            logger.info("Watchdog device closed properly")
        except Exception as e:
            logger.error(f"Error closing watchdog: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """Get watchdog statistics."""
        stats = self.stats.copy()
        stats["running"] = self.running
        stats["available"] = self.available

        if stats["start_time"]:
            stats["uptime_seconds"] = time.time() - stats["start_time"]

        return stats


class ServiceHealthMonitor:
    """
    Monitor health of all critical services for watchdog.
    """

    def __init__(self):
        self.services = {}
        self.lock = threading.Lock()

    def register_service(self, service_name: str, health_check: Callable[[], bool]):
        """
        Register a service with health check.

        Args:
            service_name: Service identifier
            health_check: Function that returns True if service is healthy
        """
        with self.lock:
            self.services[service_name] = {
                "health_check": health_check,
                "last_check": None,
                "last_status": None,
                "failure_count": 0,
            }

        logger.info(f"Service registered for health monitoring: {service_name}")

    def check_all_services(self) -> bool:
        """
        Check health of all registered services.

        Returns:
            bool: True if all services are healthy
        """
        with self.lock:
            all_healthy = True

            for service_name, service_info in self.services.items():
                try:
                    health_check = service_info["health_check"]
                    is_healthy = health_check()

                    service_info["last_check"] = time.time()
                    service_info["last_status"] = is_healthy

                    if not is_healthy:
                        service_info["failure_count"] += 1
                        logger.warning(
                            f"Service unhealthy: {service_name} "
                            f"(failures: {service_info['failure_count']})"
                        )
                        all_healthy = False
                    else:
                        service_info["failure_count"] = 0

                except Exception as e:
                    logger.error(f"Health check failed for {service_name}: {e}")
                    service_info["failure_count"] += 1
                    all_healthy = False

            return all_healthy

    def get_service_status(self) -> Dict[str, Any]:
        """Get status of all services."""
        with self.lock:
            status = {}
            for service_name, service_info in self.services.items():
                status[service_name] = {
                    "healthy": service_info["last_status"],
                    "failure_count": service_info["failure_count"],
                    "last_check": service_info["last_check"],
                }
            return status
