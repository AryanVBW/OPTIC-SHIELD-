"""
Comprehensive health monitoring and metrics system.
Provides real-time system health, alerting, and self-healing capabilities.
"""

import logging
import time
import threading
import json
import os
import platform
from typing import Optional, Dict, Any, List, Callable
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from collections import deque

logger = logging.getLogger(__name__)


class HealthStatus(Enum):
    """Health status levels."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    CRITICAL = "critical"


class ComponentType(Enum):
    """Types of monitored components."""
    CAMERA = "camera"
    DETECTOR = "detector"
    DATABASE = "database"
    NETWORK = "network"
    DELIVERY = "delivery"
    STORAGE = "storage"
    MEMORY = "memory"
    CPU = "cpu"
    GPS = "gps"


@dataclass
class HealthCheck:
    """Result of a health check."""
    component: str
    status: HealthStatus
    message: str = ""
    latency_ms: float = 0
    timestamp: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "component": self.component,
            "status": self.status.value,
            "message": self.message,
            "latency_ms": self.latency_ms,
            "timestamp": self.timestamp,
            "metadata": self.metadata
        }


@dataclass
class Alert:
    """System alert."""
    id: str
    severity: str  # info, warning, error, critical
    component: str
    message: str
    timestamp: float = field(default_factory=time.time)
    acknowledged: bool = False
    resolved: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "severity": self.severity,
            "component": self.component,
            "message": self.message,
            "timestamp": self.timestamp,
            "acknowledged": self.acknowledged,
            "resolved": self.resolved,
            "metadata": self.metadata
        }


class MetricsCollector:
    """
    Collects and aggregates system metrics.
    """
    
    def __init__(self, max_history: int = 1000):
        self.max_history = max_history
        self._metrics: Dict[str, deque] = {}
        self._counters: Dict[str, int] = {}
        self._gauges: Dict[str, float] = {}
        self._lock = threading.Lock()
    
    def record_metric(self, name: str, value: float, tags: Optional[Dict[str, str]] = None):
        """Record a metric value."""
        with self._lock:
            if name not in self._metrics:
                self._metrics[name] = deque(maxlen=self.max_history)
            
            self._metrics[name].append({
                "value": value,
                "timestamp": time.time(),
                "tags": tags or {}
            })
    
    def increment_counter(self, name: str, value: int = 1):
        """Increment a counter."""
        with self._lock:
            self._counters[name] = self._counters.get(name, 0) + value
    
    def set_gauge(self, name: str, value: float):
        """Set a gauge value."""
        with self._lock:
            self._gauges[name] = value
    
    def get_counter(self, name: str) -> int:
        """Get counter value."""
        return self._counters.get(name, 0)
    
    def get_gauge(self, name: str) -> float:
        """Get gauge value."""
        return self._gauges.get(name, 0.0)
    
    def get_metric_stats(self, name: str) -> Dict[str, Any]:
        """Get statistics for a metric."""
        with self._lock:
            if name not in self._metrics or not self._metrics[name]:
                return {"count": 0}
            
            values = [m["value"] for m in self._metrics[name]]
            return {
                "count": len(values),
                "min": min(values),
                "max": max(values),
                "avg": sum(values) / len(values),
                "last": values[-1] if values else None
            }
    
    def get_all_metrics(self) -> Dict[str, Any]:
        """Get all metrics summary."""
        with self._lock:
            return {
                "counters": dict(self._counters),
                "gauges": dict(self._gauges),
                "metrics": {
                    name: self.get_metric_stats(name)
                    for name in self._metrics
                }
            }


class SelfHealer:
    """
    Self-healing capabilities for automatic recovery.
    """
    
    def __init__(self):
        self._recovery_actions: Dict[str, Callable] = {}
        self._recovery_history: deque = deque(maxlen=100)
        self._lock = threading.Lock()
    
    def register_recovery_action(self, component: str, action: Callable):
        """Register a recovery action for a component."""
        self._recovery_actions[component] = action
    
    def attempt_recovery(self, component: str, error: str) -> bool:
        """Attempt to recover a failed component."""
        if component not in self._recovery_actions:
            logger.warning(f"No recovery action registered for {component}")
            return False
        
        try:
            logger.info(f"Attempting recovery for {component}: {error}")
            
            action = self._recovery_actions[component]
            result = action()
            
            with self._lock:
                self._recovery_history.append({
                    "component": component,
                    "error": error,
                    "success": result,
                    "timestamp": time.time()
                })
            
            if result:
                logger.info(f"Recovery successful for {component}")
            else:
                logger.warning(f"Recovery failed for {component}")
            
            return result
            
        except Exception as e:
            logger.error(f"Recovery action failed for {component}: {e}")
            return False
    
    def get_recovery_history(self) -> List[Dict[str, Any]]:
        """Get recovery attempt history."""
        with self._lock:
            return list(self._recovery_history)


class HealthMonitor:
    """
    Comprehensive health monitoring system.
    
    Features:
    - Component health checks
    - System resource monitoring
    - Alert management
    - Metrics collection
    - Self-healing capabilities
    - Health history tracking
    """
    
    def __init__(
        self,
        check_interval: float = 30.0,
        alert_cooldown: float = 300.0,
        max_alerts: int = 100,
        max_history: int = 1000
    ):
        self.check_interval = check_interval
        self.alert_cooldown = alert_cooldown
        self.max_alerts = max_alerts
        
        self._health_checks: Dict[str, Callable[[], HealthCheck]] = {}
        self._component_status: Dict[str, HealthCheck] = {}
        self._alerts: deque = deque(maxlen=max_alerts)
        self._alert_times: Dict[str, float] = {}
        
        self.metrics = MetricsCollector(max_history=max_history)
        self.self_healer = SelfHealer()
        
        self._lock = threading.Lock()
        self._monitor_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        
        # Alert callbacks
        self._alert_callbacks: List[Callable[[Alert], None]] = []
        
        # System info
        self._start_time = time.time()
        self._device_id: str = ""
    
    def set_device_id(self, device_id: str):
        """Set device ID for alerts."""
        self._device_id = device_id
    
    def register_health_check(self, component: str, check_func: Callable[[], HealthCheck]):
        """Register a health check function for a component."""
        self._health_checks[component] = check_func
    
    def register_alert_callback(self, callback: Callable[[Alert], None]):
        """Register callback for alerts."""
        self._alert_callbacks.append(callback)
    
    def start(self):
        """Start health monitoring."""
        self._stop_event.clear()
        self._monitor_thread = threading.Thread(
            target=self._monitor_loop,
            name="HealthMonitor",
            daemon=True
        )
        self._monitor_thread.start()
        logger.info("Health monitor started")
    
    def stop(self):
        """Stop health monitoring."""
        self._stop_event.set()
        if self._monitor_thread and self._monitor_thread.is_alive():
            self._monitor_thread.join(timeout=10)
        logger.info("Health monitor stopped")
    
    def _monitor_loop(self):
        """Main monitoring loop."""
        while not self._stop_event.is_set():
            try:
                self._run_health_checks()
                self._check_system_resources()
            except Exception as e:
                logger.error(f"Health monitor error: {e}")
            
            self._stop_event.wait(self.check_interval)
    
    def _run_health_checks(self):
        """Run all registered health checks."""
        for component, check_func in self._health_checks.items():
            try:
                start = time.perf_counter()
                result = check_func()
                result.latency_ms = (time.perf_counter() - start) * 1000
                
                with self._lock:
                    self._component_status[component] = result
                
                # Record metrics
                self.metrics.record_metric(
                    f"health_check_{component}",
                    1 if result.status == HealthStatus.HEALTHY else 0
                )
                self.metrics.record_metric(
                    f"health_check_latency_{component}",
                    result.latency_ms
                )
                
                # Generate alerts for unhealthy components
                if result.status in [HealthStatus.UNHEALTHY, HealthStatus.CRITICAL]:
                    self._create_alert(
                        severity="critical" if result.status == HealthStatus.CRITICAL else "error",
                        component=component,
                        message=result.message or f"{component} is {result.status.value}"
                    )
                    
                    # Attempt self-healing
                    if result.status == HealthStatus.CRITICAL:
                        self.self_healer.attempt_recovery(component, result.message)
                
            except Exception as e:
                logger.error(f"Health check failed for {component}: {e}")
                self._create_alert(
                    severity="error",
                    component=component,
                    message=f"Health check failed: {e}"
                )
    
    def _check_system_resources(self):
        """Check system resource usage."""
        try:
            import psutil
            
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            self.metrics.set_gauge("cpu_percent", cpu_percent)
            
            if cpu_percent > 90:
                self._create_alert(
                    severity="warning",
                    component="cpu",
                    message=f"High CPU usage: {cpu_percent}%"
                )
            
            # Memory usage
            memory = psutil.virtual_memory()
            self.metrics.set_gauge("memory_percent", memory.percent)
            self.metrics.set_gauge("memory_available_mb", memory.available / (1024 * 1024))
            
            if memory.percent > 90:
                self._create_alert(
                    severity="warning",
                    component="memory",
                    message=f"High memory usage: {memory.percent}%"
                )
            
            # Disk usage
            disk = psutil.disk_usage('/')
            self.metrics.set_gauge("disk_percent", disk.percent)
            self.metrics.set_gauge("disk_free_gb", disk.free / (1024 * 1024 * 1024))
            
            if disk.percent > 90:
                self._create_alert(
                    severity="warning",
                    component="storage",
                    message=f"Low disk space: {disk.percent}% used"
                )
            
            # Temperature (if available)
            try:
                temps = psutil.sensors_temperatures()
                if temps:
                    for name, entries in temps.items():
                        for entry in entries:
                            if entry.current:
                                self.metrics.set_gauge(f"temp_{name}", entry.current)
                                if entry.current > 80:
                                    self._create_alert(
                                        severity="warning",
                                        component="temperature",
                                        message=f"High temperature: {entry.current}°C"
                                    )
            except:
                pass
                
        except ImportError:
            logger.debug("psutil not available for system monitoring")
        except Exception as e:
            logger.debug(f"System resource check error: {e}")
    
    def _create_alert(
        self,
        severity: str,
        component: str,
        message: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Create a new alert with cooldown."""
        alert_key = f"{component}:{message}"
        now = time.time()
        
        # Check cooldown
        if alert_key in self._alert_times:
            if now - self._alert_times[alert_key] < self.alert_cooldown:
                return
        
        self._alert_times[alert_key] = now
        
        alert = Alert(
            id=f"alert_{self._device_id}_{int(now * 1000)}",
            severity=severity,
            component=component,
            message=message,
            metadata=metadata or {}
        )
        
        with self._lock:
            self._alerts.append(alert)
        
        # Notify callbacks
        for callback in self._alert_callbacks:
            try:
                callback(alert)
            except Exception as e:
                logger.error(f"Alert callback error: {e}")
        
        logger.warning(f"Alert [{severity}] {component}: {message}")
        self.metrics.increment_counter(f"alerts_{severity}")
    
    def get_overall_status(self) -> HealthStatus:
        """Get overall system health status."""
        with self._lock:
            if not self._component_status:
                return HealthStatus.HEALTHY
            
            statuses = [c.status for c in self._component_status.values()]
            
            if HealthStatus.CRITICAL in statuses:
                return HealthStatus.CRITICAL
            if HealthStatus.UNHEALTHY in statuses:
                return HealthStatus.UNHEALTHY
            if HealthStatus.DEGRADED in statuses:
                return HealthStatus.DEGRADED
            
            return HealthStatus.HEALTHY
    
    def get_component_status(self, component: str) -> Optional[HealthCheck]:
        """Get status of a specific component."""
        with self._lock:
            return self._component_status.get(component)
    
    def get_all_component_status(self) -> Dict[str, Dict[str, Any]]:
        """Get status of all components."""
        with self._lock:
            return {
                name: check.to_dict()
                for name, check in self._component_status.items()
            }
    
    def get_active_alerts(self) -> List[Dict[str, Any]]:
        """Get active (unresolved) alerts."""
        with self._lock:
            return [
                alert.to_dict()
                for alert in self._alerts
                if not alert.resolved
            ]
    
    def acknowledge_alert(self, alert_id: str) -> bool:
        """Acknowledge an alert."""
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id:
                    alert.acknowledged = True
                    return True
        return False
    
    def resolve_alert(self, alert_id: str) -> bool:
        """Resolve an alert."""
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id:
                    alert.resolved = True
                    return True
        return False
    
    def get_health_report(self) -> Dict[str, Any]:
        """Get comprehensive health report."""
        uptime = time.time() - self._start_time
        
        return {
            "device_id": self._device_id,
            "timestamp": time.time(),
            "uptime_seconds": uptime,
            "overall_status": self.get_overall_status().value,
            "components": self.get_all_component_status(),
            "active_alerts": len([a for a in self._alerts if not a.resolved]),
            "metrics": self.metrics.get_all_metrics(),
            "recovery_history": self.self_healer.get_recovery_history()[-10:],
            "system": self._get_system_info()
        }
    
    def _get_system_info(self) -> Dict[str, Any]:
        """Get system information."""
        info = {
            "platform": platform.system(),
            "platform_release": platform.release(),
            "architecture": platform.machine(),
            "python_version": platform.python_version(),
            "hostname": platform.node()
        }
        
        try:
            import psutil
            info["cpu_count"] = psutil.cpu_count()
            info["memory_total_mb"] = psutil.virtual_memory().total / (1024 * 1024)
        except:
            pass
        
        return info
    
    def create_camera_health_check(self, camera) -> Callable[[], HealthCheck]:
        """Create health check for camera component."""
        def check() -> HealthCheck:
            if camera is None:
                return HealthCheck(
                    component="camera",
                    status=HealthStatus.UNHEALTHY,
                    message="Camera not initialized"
                )
            
            if not camera.is_running:
                return HealthCheck(
                    component="camera",
                    status=HealthStatus.UNHEALTHY,
                    message="Camera not running"
                )
            
            stats = camera.get_stats()
            if stats.get("error_count", 0) > 10:
                return HealthCheck(
                    component="camera",
                    status=HealthStatus.DEGRADED,
                    message=f"High error count: {stats.get('error_count')}",
                    metadata=stats
                )
            
            return HealthCheck(
                component="camera",
                status=HealthStatus.HEALTHY,
                message="Camera operational",
                metadata=stats
            )
        
        return check
    
    def create_detector_health_check(self, detector) -> Callable[[], HealthCheck]:
        """Create health check for detector component."""
        def check() -> HealthCheck:
            if detector is None:
                return HealthCheck(
                    component="detector",
                    status=HealthStatus.UNHEALTHY,
                    message="Detector not initialized"
                )
            
            if not detector.model_loaded:
                return HealthCheck(
                    component="detector",
                    status=HealthStatus.UNHEALTHY,
                    message="Model not loaded"
                )
            
            stats = detector.get_stats()
            avg_inference = stats.get("avg_inference_ms", 0)
            
            if avg_inference > 500:
                return HealthCheck(
                    component="detector",
                    status=HealthStatus.DEGRADED,
                    message=f"Slow inference: {avg_inference:.0f}ms",
                    metadata=stats
                )
            
            return HealthCheck(
                component="detector",
                status=HealthStatus.HEALTHY,
                message=f"Detector operational ({avg_inference:.0f}ms avg)",
                metadata=stats
            )
        
        return check
    
    def create_delivery_health_check(self, delivery_service) -> Callable[[], HealthCheck]:
        """Create health check for delivery service."""
        def check() -> HealthCheck:
            if delivery_service is None:
                return HealthCheck(
                    component="delivery",
                    status=HealthStatus.DEGRADED,
                    message="Delivery service not configured"
                )
            
            stats = delivery_service.get_stats()
            metrics = stats.get("metrics", {})
            
            # Check consecutive failures
            consecutive_failures = metrics.get("consecutive_failures", 0)
            if consecutive_failures > 10:
                return HealthCheck(
                    component="delivery",
                    status=HealthStatus.CRITICAL,
                    message=f"High consecutive failures: {consecutive_failures}",
                    metadata=stats
                )
            
            # Check success rate
            success_rate = metrics.get("success_rate", 100)
            if success_rate < 50:
                return HealthCheck(
                    component="delivery",
                    status=HealthStatus.UNHEALTHY,
                    message=f"Low success rate: {success_rate}%",
                    metadata=stats
                )
            
            if success_rate < 90:
                return HealthCheck(
                    component="delivery",
                    status=HealthStatus.DEGRADED,
                    message=f"Degraded success rate: {success_rate}%",
                    metadata=stats
                )
            
            # Check queue size
            pending = stats.get("broker", {}).get("queue_pending", 0)
            if pending > 1000:
                return HealthCheck(
                    component="delivery",
                    status=HealthStatus.DEGRADED,
                    message=f"Large queue backlog: {pending} pending",
                    metadata=stats
                )
            
            return HealthCheck(
                component="delivery",
                status=HealthStatus.HEALTHY,
                message=f"Delivery operational ({success_rate}% success)",
                metadata=stats
            )
        
        return check
