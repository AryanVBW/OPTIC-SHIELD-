#!/usr/bin/env python3
"""
System Telemetry Service

Collects and reports hardware metrics in real-time.
Monitors system health and generates alerts for anomalies.
"""

import time
import logging
import threading
from typing import Dict, List, Optional, Any, Callable
from collections import deque
from datetime import datetime, timedelta

from ..utils.rpi_hardware import RaspberryPiHardware

logger = logging.getLogger(__name__)


class SystemTelemetryService:
    """
    Real-time system telemetry collection and monitoring.

    Features:
    - Collects metrics every N seconds
    - Maintains historical data (last 24 hours)
    - Detects anomalies (temp spikes, throttling, low voltage)
    - Sends alerts for critical conditions
    - Buffers metrics for dashboard sync
    """

    def __init__(
        self,
        collection_interval: int = 5,
        history_hours: int = 24,
        alert_thresholds: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize telemetry service.

        Args:
            collection_interval: Seconds between metric collections
            history_hours: Hours of historical data to retain
            alert_thresholds: Custom alert thresholds
        """
        self.collection_interval = collection_interval
        self.history_hours = history_hours
        self.alert_thresholds = alert_thresholds or self._default_thresholds()

        self.hardware = RaspberryPiHardware()
        self.running = False
        self.thread: Optional[threading.Thread] = None

        # Historical data storage
        max_samples = (history_hours * 3600) // collection_interval
        self.history: deque = deque(maxlen=max_samples)

        # Alert callbacks
        self.alert_callbacks: List[Callable] = []

        # Statistics
        self.stats = {
            "collections_count": 0,
            "errors_count": 0,
            "alerts_sent": 0,
            "start_time": None,
        }

        # Last known values for anomaly detection
        self.last_metrics: Optional[Dict] = None
        self.active_alerts: Dict[str, datetime] = {}

    def _default_thresholds(self) -> Dict[str, Any]:
        """Get default alert thresholds."""
        return {
            "cpu_temp_celsius": 75,
            "gpu_temp_celsius": 70,
            "cpu_throttling": True,
            "undervoltage": True,
            "low_voltage_v": 4.75,
            "high_memory_percent": 85,
            "high_swap_percent": 80,
            "low_storage_mb": 1000,
            "high_cpu_percent": 90,
        }

    def add_alert_callback(self, callback: Callable[[Dict], None]):
        """Add callback for alerts."""
        self.alert_callbacks.append(callback)

    def start(self):
        """Start telemetry collection."""
        if self.running:
            logger.warning("Telemetry service already running")
            return

        logger.info("Starting system telemetry service")
        self.running = True
        self.stats["start_time"] = datetime.now()

        self.thread = threading.Thread(target=self._collection_loop, daemon=True)
        self.thread.start()

    def stop(self):
        """Stop telemetry collection."""
        logger.info("Stopping system telemetry service")
        self.running = False

        if self.thread:
            self.thread.join(timeout=10)

    def _collection_loop(self):
        """Main collection loop."""
        logger.info(
            f"Telemetry collection started (interval: {self.collection_interval}s)"
        )

        while self.running:
            try:
                start_time = time.time()

                # Collect metrics
                metrics = self._collect_metrics()

                if metrics:
                    # Store in history
                    self.history.append(metrics)
                    self.last_metrics = metrics
                    self.stats["collections_count"] += 1

                    # Check for alerts
                    self._check_alerts(metrics)

                # Sleep for remaining interval
                elapsed = time.time() - start_time
                sleep_time = max(0, self.collection_interval - elapsed)
                time.sleep(sleep_time)

            except Exception as e:
                logger.error(f"Error in telemetry collection: {e}", exc_info=True)
                self.stats["errors_count"] += 1
                time.sleep(self.collection_interval)

    def _collect_metrics(self) -> Optional[Dict]:
        """Collect current system metrics."""
        try:
            metrics = self.hardware.get_all_metrics()
            metrics["timestamp"] = datetime.now().isoformat()
            metrics["collection_time"] = time.time()

            return metrics
        except Exception as e:
            logger.error(f"Error collecting metrics: {e}")
            return None

    def _check_alerts(self, metrics: Dict):
        """Check metrics against thresholds and generate alerts."""
        alerts = []

        # CPU temperature
        cpu_temp = metrics.get("cpu", {}).get("temperature_celsius")
        if cpu_temp and cpu_temp > self.alert_thresholds["cpu_temp_celsius"]:
            if not self._is_alert_active("cpu_temp"):
                alerts.append(
                    {
                        "type": "cpu_temperature",
                        "severity": "warning" if cpu_temp < 80 else "critical",
                        "message": f"CPU temperature high: {cpu_temp:.1f}°C",
                        "value": cpu_temp,
                        "threshold": self.alert_thresholds["cpu_temp_celsius"],
                    }
                )
                self._set_alert_active("cpu_temp")
        else:
            self._clear_alert("cpu_temp")

        # GPU temperature
        gpu_temp = metrics.get("gpu", {}).get("temperature_celsius")
        if gpu_temp and gpu_temp > self.alert_thresholds["gpu_temp_celsius"]:
            if not self._is_alert_active("gpu_temp"):
                alerts.append(
                    {
                        "type": "gpu_temperature",
                        "severity": "warning",
                        "message": f"GPU temperature high: {gpu_temp:.1f}°C",
                        "value": gpu_temp,
                        "threshold": self.alert_thresholds["gpu_temp_celsius"],
                    }
                )
                self._set_alert_active("gpu_temp")
        else:
            self._clear_alert("gpu_temp")

        # CPU throttling
        if self.alert_thresholds["cpu_throttling"]:
            throttled = metrics.get("cpu", {}).get("throttled", False)
            if throttled:
                throttled_status = metrics.get("cpu", {}).get("throttled_status", {})
                if throttled_status.get("currently_throttled"):
                    if not self._is_alert_active("throttling"):
                        alerts.append(
                            {
                                "type": "cpu_throttling",
                                "severity": "warning",
                                "message": "CPU is being throttled",
                                "details": throttled_status,
                            }
                        )
                        self._set_alert_active("throttling")
            else:
                self._clear_alert("throttling")

        # Undervoltage
        if self.alert_thresholds["undervoltage"]:
            power = metrics.get("power", {})
            if power.get("undervoltage_now"):
                if not self._is_alert_active("undervoltage"):
                    alerts.append(
                        {
                            "type": "undervoltage",
                            "severity": "critical",
                            "message": "Undervoltage detected - power supply insufficient",
                            "voltage": power.get("core_voltage"),
                        }
                    )
                    self._set_alert_active("undervoltage")
            else:
                self._clear_alert("undervoltage")

        # Memory usage
        memory = metrics.get("memory", {})
        mem_percent = memory.get("used_percent", 0)
        if mem_percent > self.alert_thresholds["high_memory_percent"]:
            if not self._is_alert_active("memory"):
                alerts.append(
                    {
                        "type": "high_memory",
                        "severity": "warning" if mem_percent < 90 else "critical",
                        "message": f"High memory usage: {mem_percent:.1f}%",
                        "value": mem_percent,
                        "threshold": self.alert_thresholds["high_memory_percent"],
                    }
                )
                self._set_alert_active("memory")
        else:
            self._clear_alert("memory")

        # Swap usage
        swap_percent = memory.get("swap_percent", 0)
        if swap_percent > self.alert_thresholds["high_swap_percent"]:
            if not self._is_alert_active("swap"):
                alerts.append(
                    {
                        "type": "high_swap",
                        "severity": "warning",
                        "message": f"High swap usage: {swap_percent:.1f}%",
                        "value": swap_percent,
                    }
                )
                self._set_alert_active("swap")
        else:
            self._clear_alert("swap")

        # Storage space
        storage = metrics.get("storage", {})
        for partition in storage.get("partitions", []):
            if partition.get("mountpoint") == "/":
                free_mb = partition.get("free_mb", 0)
                if free_mb < self.alert_thresholds["low_storage_mb"]:
                    if not self._is_alert_active("storage"):
                        alerts.append(
                            {
                                "type": "low_storage",
                                "severity": "warning" if free_mb > 500 else "critical",
                                "message": f"Low storage space: {free_mb} MB remaining",
                                "value": free_mb,
                                "threshold": self.alert_thresholds["low_storage_mb"],
                            }
                        )
                        self._set_alert_active("storage")
                else:
                    self._clear_alert("storage")

        # CPU usage
        cpu_usage = metrics.get("cpu", {}).get("usage_percent", 0)
        if cpu_usage > self.alert_thresholds["high_cpu_percent"]:
            if not self._is_alert_active("cpu_usage"):
                alerts.append(
                    {
                        "type": "high_cpu",
                        "severity": "info",
                        "message": f"High CPU usage: {cpu_usage:.1f}%",
                        "value": cpu_usage,
                    }
                )
                self._set_alert_active("cpu_usage")
        else:
            self._clear_alert("cpu_usage")

        # Send alerts
        if alerts:
            for alert in alerts:
                alert["timestamp"] = datetime.now().isoformat()
                logger.warning(f"System alert: {alert['message']}")
                self._send_alert(alert)

    def _is_alert_active(self, alert_key: str) -> bool:
        """Check if alert is already active."""
        return alert_key in self.active_alerts

    def _set_alert_active(self, alert_key: str):
        """Mark alert as active."""
        self.active_alerts[alert_key] = datetime.now()

    def _clear_alert(self, alert_key: str):
        """Clear active alert."""
        if alert_key in self.active_alerts:
            del self.active_alerts[alert_key]

    def _send_alert(self, alert: Dict):
        """Send alert to registered callbacks."""
        self.stats["alerts_sent"] += 1

        for callback in self.alert_callbacks:
            try:
                callback(alert)
            except Exception as e:
                logger.error(f"Error in alert callback: {e}")

    def get_current_metrics(self) -> Optional[Dict]:
        """Get most recent metrics."""
        return self.last_metrics

    def get_historical_metrics(self, minutes: Optional[int] = None) -> List[Dict]:
        """
        Get historical metrics.

        Args:
            minutes: Number of minutes of history (None = all)

        Returns:
            List of metric snapshots
        """
        if minutes is None:
            return list(self.history)

        cutoff_time = time.time() - (minutes * 60)
        return [m for m in self.history if m.get("collection_time", 0) >= cutoff_time]

    def get_metric_series(
        self, metric_path: str, minutes: Optional[int] = None
    ) -> List[tuple]:
        """
        Get time series for a specific metric.

        Args:
            metric_path: Dot-separated path (e.g., 'cpu.temperature_celsius')
            minutes: Number of minutes of history

        Returns:
            List of (timestamp, value) tuples
        """
        history = self.get_historical_metrics(minutes)
        series = []

        for snapshot in history:
            # Navigate metric path
            value = snapshot
            for key in metric_path.split("."):
                if isinstance(value, dict):
                    value = value.get(key)
                else:
                    value = None
                    break

            if value is not None:
                timestamp = snapshot.get("timestamp")
                series.append((timestamp, value))

        return series

    def get_stats(self) -> Dict[str, Any]:
        """Get service statistics."""
        stats = self.stats.copy()
        stats["running"] = self.running
        stats["history_size"] = len(self.history)
        stats["active_alerts"] = list(self.active_alerts.keys())

        if stats["start_time"]:
            uptime = datetime.now() - stats["start_time"]
            stats["uptime_seconds"] = uptime.total_seconds()

        return stats
