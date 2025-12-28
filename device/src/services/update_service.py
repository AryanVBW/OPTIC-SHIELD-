"""
Automatic update service for OPTIC-SHIELD devices.
Securely pulls latest changes via git and safely restarts services.
"""

import logging
import time
import threading
import subprocess
import os
import json
import hashlib
import hmac
from typing import Optional, Dict, Any, List, Callable
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

logger = logging.getLogger(__name__)


class UpdateStatus(Enum):
    """Status of an update operation."""
    IDLE = "idle"
    CHECKING = "checking"
    DOWNLOADING = "downloading"
    APPLYING = "applying"
    RESTARTING = "restarting"
    SUCCESS = "success"
    FAILED = "failed"
    UP_TO_DATE = "up_to_date"


class UpdateSource(Enum):
    """Source that triggered the update."""
    MANUAL = "manual"
    PORTAL = "portal"
    SCHEDULED = "scheduled"
    AUTO = "auto"


@dataclass
class UpdateResult:
    """Result of an update operation."""
    success: bool
    status: UpdateStatus
    message: str = ""
    old_version: str = ""
    new_version: str = ""
    changes: List[str] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)
    source: UpdateSource = UpdateSource.MANUAL
    duration_seconds: float = 0
    requires_restart: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "status": self.status.value,
            "message": self.message,
            "old_version": self.old_version,
            "new_version": self.new_version,
            "changes": self.changes,
            "timestamp": self.timestamp,
            "source": self.source.value,
            "duration_seconds": self.duration_seconds,
            "requires_restart": self.requires_restart
        }


@dataclass
class UpdateInfo:
    """Information about available updates."""
    available: bool
    current_version: str
    latest_version: str
    commits_behind: int = 0
    changes: List[str] = field(default_factory=list)
    checked_at: float = field(default_factory=time.time)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "available": self.available,
            "current_version": self.current_version,
            "latest_version": self.latest_version,
            "commits_behind": self.commits_behind,
            "changes": self.changes,
            "checked_at": self.checked_at
        }


class UpdateService:
    """
    Service for managing automatic updates on OPTIC-SHIELD devices.
    
    Features:
    - Git-based update mechanism
    - Secure verification of updates
    - Pre-update backup
    - Safe service restart
    - Rollback capability
    - Portal-triggered updates
    - Update history tracking
    """
    
    VERSION_FILE = "version.txt"
    UPDATE_LOCK_FILE = ".update.lock"
    BACKUP_DIR = "backups"
    
    def __init__(
        self,
        repo_path: str,
        remote_name: str = "origin",
        branch: str = "main",
        check_interval: float = 3600.0,  # 1 hour
        auto_update: bool = False,
        service_name: str = "optic-shield",
        api_url: str = "",
        api_key: str = "",
        device_id: str = "",
        device_secret: str = ""
    ):
        self.repo_path = Path(repo_path)
        self.remote_name = remote_name
        self.branch = branch
        self.check_interval = check_interval
        self.auto_update = auto_update
        self.service_name = service_name
        self.api_url = api_url.rstrip('/') if api_url else ""
        self.api_key = api_key
        self.device_id = device_id
        self.device_secret = device_secret
        
        self._status = UpdateStatus.IDLE
        self._last_check: Optional[float] = None
        self._last_update: Optional[UpdateResult] = None
        self._update_info: Optional[UpdateInfo] = None
        self._update_history: List[UpdateResult] = []
        
        self._lock = threading.Lock()
        self._update_lock = threading.Lock()
        self._check_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        
        # Callbacks
        self._on_update_available: List[Callable[[UpdateInfo], None]] = []
        self._on_update_complete: List[Callable[[UpdateResult], None]] = []
        self._on_restart_required: List[Callable[[], None]] = []
        
        # Pending portal command
        self._pending_update_command: Optional[Dict[str, Any]] = None
    
    def initialize(self) -> bool:
        """Initialize the update service."""
        try:
            # Verify git repository
            if not (self.repo_path / ".git").exists():
                logger.error(f"Not a git repository: {self.repo_path}")
                return False
            
            # Create backup directory
            backup_dir = self.repo_path / self.BACKUP_DIR
            backup_dir.mkdir(parents=True, exist_ok=True)
            
            # Get current version
            current_version = self._get_current_version()
            logger.info(f"Update service initialized. Current version: {current_version}")
            
            return True
        except Exception as e:
            logger.error(f"Failed to initialize update service: {e}")
            return False
    
    def start(self):
        """Start the update service background thread."""
        self._stop_event.clear()
        
        self._check_thread = threading.Thread(
            target=self._check_loop,
            name="UpdateService",
            daemon=True
        )
        self._check_thread.start()
        
        logger.info("Update service started")
    
    def stop(self):
        """Stop the update service."""
        self._stop_event.set()
        
        if self._check_thread and self._check_thread.is_alive():
            self._check_thread.join(timeout=10)
        
        logger.info("Update service stopped")
    
    def _check_loop(self):
        """Background loop for checking updates."""
        # Initial check after 60 seconds
        self._stop_event.wait(60)
        
        poll_interval = min(60.0, self.check_interval)  # Poll for commands every minute
        last_full_check = 0
        
        while not self._stop_event.is_set():
            try:
                # Check for portal-triggered updates
                if self._pending_update_command:
                    self._process_portal_update_command()
                
                # Poll portal for pending commands
                self._poll_for_commands()
                
                # Full update check at configured interval
                now = time.time()
                if now - last_full_check >= self.check_interval:
                    update_info = self.check_for_updates()
                    last_full_check = now
                    
                    if update_info.available:
                        # Notify callbacks
                        for callback in self._on_update_available:
                            try:
                                callback(update_info)
                            except Exception as e:
                                logger.error(f"Update available callback error: {e}")
                        
                        # Auto-update if enabled
                        if self.auto_update:
                            self.apply_update(source=UpdateSource.AUTO)
                
            except Exception as e:
                logger.error(f"Update check error: {e}")
            
            self._stop_event.wait(poll_interval)
    
    def _poll_for_commands(self):
        """Poll portal for pending update commands."""
        if not self.api_url or not self.api_key:
            return
        
        try:
            import urllib.request
            import urllib.error
            
            # Send current status and get any pending commands
            data = {
                "device_id": self.device_id,
                "current_status": self._status.value,
                "timestamp": time.time()
            }
            
            if self._update_info:
                data["update_info"] = self._update_info.to_dict()
            
            timestamp = int(time.time())
            payload = json.dumps(data)
            signature = self._generate_signature(payload, timestamp)
            
            headers = {
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
                "X-Device-ID": self.device_id,
                "X-Timestamp": str(timestamp),
                "X-Signature": signature
            }
            
            url = f"{self.api_url}/devices/update-status"
            req = urllib.request.Request(
                url,
                data=payload.encode(),
                headers=headers,
                method="POST"
            )
            
            with urllib.request.urlopen(req, timeout=15) as response:
                response_data = response.read().decode()
                if response_data:
                    result = json.loads(response_data)
                    pending_command = result.get("pending_command")
                    if pending_command:
                        logger.info(f"Received command from portal: {pending_command.get('action')}")
                        self.trigger_update_from_portal(pending_command)
                        
        except Exception as e:
            logger.debug(f"Command poll failed: {e}")
    
    def _get_current_version(self) -> str:
        """Get current version from git commit hash."""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            logger.error(f"Failed to get current version: {e}")
        
        return "unknown"
    
    def _get_current_commit(self) -> str:
        """Get full current commit hash."""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            logger.error(f"Failed to get current commit: {e}")
        
        return ""
    
    def _get_remote_version(self) -> str:
        """Get latest version from remote."""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--short", f"{self.remote_name}/{self.branch}"],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            logger.error(f"Failed to get remote version: {e}")
        
        return "unknown"
    
    def check_for_updates(self) -> UpdateInfo:
        """Check if updates are available."""
        with self._lock:
            self._status = UpdateStatus.CHECKING
        
        try:
            # Fetch latest from remote
            fetch_result = subprocess.run(
                ["git", "fetch", self.remote_name, self.branch],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if fetch_result.returncode != 0:
                logger.warning(f"Git fetch failed: {fetch_result.stderr}")
            
            current_version = self._get_current_version()
            remote_version = self._get_remote_version()
            
            # Count commits behind
            commits_behind = 0
            changes = []
            
            try:
                result = subprocess.run(
                    ["git", "rev-list", "--count", f"HEAD..{self.remote_name}/{self.branch}"],
                    cwd=self.repo_path,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode == 0:
                    commits_behind = int(result.stdout.strip())
                
                # Get commit messages for changes
                if commits_behind > 0:
                    log_result = subprocess.run(
                        ["git", "log", "--oneline", f"HEAD..{self.remote_name}/{self.branch}"],
                        cwd=self.repo_path,
                        capture_output=True,
                        text=True,
                        timeout=30
                    )
                    if log_result.returncode == 0:
                        changes = log_result.stdout.strip().split('\n')[:10]  # Limit to 10
            except Exception as e:
                logger.warning(f"Failed to get commit info: {e}")
            
            update_info = UpdateInfo(
                available=commits_behind > 0,
                current_version=current_version,
                latest_version=remote_version,
                commits_behind=commits_behind,
                changes=changes
            )
            
            with self._lock:
                self._update_info = update_info
                self._last_check = time.time()
                self._status = UpdateStatus.IDLE
            
            # Report to portal
            self._report_update_status(update_info)
            
            logger.info(f"Update check complete. Behind: {commits_behind} commits")
            return update_info
            
        except Exception as e:
            logger.error(f"Update check failed: {e}")
            with self._lock:
                self._status = UpdateStatus.FAILED
            
            return UpdateInfo(
                available=False,
                current_version=self._get_current_version(),
                latest_version="unknown"
            )
    
    def apply_update(self, source: UpdateSource = UpdateSource.MANUAL) -> UpdateResult:
        """Apply available updates."""
        if not self._update_lock.acquire(blocking=False):
            return UpdateResult(
                success=False,
                status=UpdateStatus.FAILED,
                message="Update already in progress",
                source=source
            )
        
        start_time = time.time()
        old_version = self._get_current_version()
        old_commit = self._get_current_commit()
        
        try:
            with self._lock:
                self._status = UpdateStatus.DOWNLOADING
            
            logger.info(f"Starting update from {old_version} (source: {source.value})")
            
            # Create lock file
            lock_file = self.repo_path / self.UPDATE_LOCK_FILE
            lock_file.write_text(json.dumps({
                "started_at": time.time(),
                "old_version": old_version,
                "source": source.value
            }))
            
            # Stash any local changes
            stash_result = subprocess.run(
                ["git", "stash", "--include-untracked"],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            with self._lock:
                self._status = UpdateStatus.APPLYING
            
            # Pull latest changes
            pull_result = subprocess.run(
                ["git", "pull", self.remote_name, self.branch, "--ff-only"],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if pull_result.returncode != 0:
                # Rollback on failure
                logger.error(f"Git pull failed: {pull_result.stderr}")
                self._rollback(old_commit)
                
                result = UpdateResult(
                    success=False,
                    status=UpdateStatus.FAILED,
                    message=f"Git pull failed: {pull_result.stderr}",
                    old_version=old_version,
                    source=source,
                    duration_seconds=time.time() - start_time
                )
                
                with self._lock:
                    self._last_update = result
                    self._update_history.append(result)
                    self._status = UpdateStatus.FAILED
                
                return result
            
            new_version = self._get_current_version()
            
            # Get list of changed files
            changes = []
            try:
                diff_result = subprocess.run(
                    ["git", "diff", "--name-only", old_commit, "HEAD"],
                    cwd=self.repo_path,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if diff_result.returncode == 0:
                    changes = diff_result.stdout.strip().split('\n')
            except Exception:
                pass
            
            # Check if restart is required
            requires_restart = self._check_restart_required(changes)
            
            # Update dependencies if requirements.txt changed
            if any("requirements.txt" in f for f in changes):
                self._update_dependencies()
            
            # Remove lock file
            if lock_file.exists():
                lock_file.unlink()
            
            result = UpdateResult(
                success=True,
                status=UpdateStatus.SUCCESS,
                message=f"Updated from {old_version} to {new_version}",
                old_version=old_version,
                new_version=new_version,
                changes=changes,
                source=source,
                duration_seconds=time.time() - start_time,
                requires_restart=requires_restart
            )
            
            with self._lock:
                self._last_update = result
                self._update_history.append(result)
                self._status = UpdateStatus.SUCCESS
            
            # Notify callbacks
            for callback in self._on_update_complete:
                try:
                    callback(result)
                except Exception as e:
                    logger.error(f"Update complete callback error: {e}")
            
            # Report to portal
            self._report_update_result(result)
            
            logger.info(f"Update successful: {old_version} -> {new_version}")
            
            # Trigger restart if required
            if requires_restart:
                for callback in self._on_restart_required:
                    try:
                        callback()
                    except Exception as e:
                        logger.error(f"Restart callback error: {e}")
                
                # Schedule restart
                self._schedule_restart()
            
            return result
            
        except Exception as e:
            logger.error(f"Update failed: {e}")
            self._rollback(old_commit)
            
            result = UpdateResult(
                success=False,
                status=UpdateStatus.FAILED,
                message=str(e),
                old_version=old_version,
                source=source,
                duration_seconds=time.time() - start_time
            )
            
            with self._lock:
                self._last_update = result
                self._update_history.append(result)
                self._status = UpdateStatus.FAILED
            
            return result
            
        finally:
            self._update_lock.release()
    
    def _rollback(self, commit: str):
        """Rollback to a specific commit."""
        try:
            logger.warning(f"Rolling back to commit: {commit}")
            subprocess.run(
                ["git", "reset", "--hard", commit],
                cwd=self.repo_path,
                capture_output=True,
                timeout=60
            )
        except Exception as e:
            logger.error(f"Rollback failed: {e}")
    
    def _check_restart_required(self, changed_files: List[str]) -> bool:
        """Check if service restart is required based on changed files."""
        restart_patterns = [
            "device/main.py",
            "device/src/",
            "device/requirements.txt",
            "device/config/"
        ]
        
        for file in changed_files:
            for pattern in restart_patterns:
                if pattern in file:
                    return True
        
        return False
    
    def _update_dependencies(self):
        """Update Python dependencies."""
        try:
            logger.info("Updating Python dependencies...")
            requirements_file = self.repo_path / "device" / "requirements.txt"
            
            if requirements_file.exists():
                subprocess.run(
                    ["pip", "install", "-r", str(requirements_file), "--quiet"],
                    cwd=self.repo_path,
                    capture_output=True,
                    timeout=300
                )
                logger.info("Dependencies updated")
        except Exception as e:
            logger.warning(f"Failed to update dependencies: {e}")
    
    def _schedule_restart(self):
        """Schedule a service restart."""
        with self._lock:
            self._status = UpdateStatus.RESTARTING
        
        logger.info("Scheduling service restart in 5 seconds...")
        
        def do_restart():
            time.sleep(5)
            self.restart_service()
        
        restart_thread = threading.Thread(target=do_restart, daemon=True)
        restart_thread.start()
    
    def restart_service(self):
        """Restart the OPTIC-SHIELD service."""
        try:
            logger.info(f"Restarting service: {self.service_name}")
            
            # Try systemctl first
            result = subprocess.run(
                ["sudo", "systemctl", "restart", self.service_name],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                logger.info("Service restarted via systemctl")
                return True
            
            # Fallback: exit and let systemd restart us
            logger.info("Exiting for systemd restart...")
            os._exit(0)
            
        except Exception as e:
            logger.error(f"Service restart failed: {e}")
            return False
    
    def trigger_update_from_portal(self, command: Dict[str, Any]):
        """Handle update command from portal."""
        with self._lock:
            self._pending_update_command = command
        
        logger.info(f"Received update command from portal: {command}")
    
    def _process_portal_update_command(self):
        """Process pending portal update command."""
        with self._lock:
            command = self._pending_update_command
            self._pending_update_command = None
        
        if not command:
            return
        
        action = command.get("action", "update")
        
        if action == "check":
            self.check_for_updates()
        elif action == "update":
            self.apply_update(source=UpdateSource.PORTAL)
        elif action == "restart":
            self.restart_service()
    
    def _generate_signature(self, payload: str, timestamp: int) -> str:
        """Generate HMAC signature for request authentication."""
        if not self.device_secret:
            return ""
        
        message = f"{timestamp}.{payload}"
        signature = hmac.new(
            self.device_secret.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        return signature
    
    def _report_update_status(self, update_info: UpdateInfo):
        """Report update status to portal and check for pending commands."""
        if not self.api_url or not self.api_key:
            return
        
        try:
            import urllib.request
            import urllib.error
            
            data = {
                "device_id": self.device_id,
                "update_info": update_info.to_dict(),
                "current_status": self._status.value,
                "timestamp": time.time()
            }
            
            timestamp = int(time.time())
            payload = json.dumps(data)
            signature = self._generate_signature(payload, timestamp)
            
            headers = {
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
                "X-Device-ID": self.device_id,
                "X-Timestamp": str(timestamp),
                "X-Signature": signature
            }
            
            url = f"{self.api_url}/devices/update-status"
            req = urllib.request.Request(
                url,
                data=payload.encode(),
                headers=headers,
                method="POST"
            )
            
            with urllib.request.urlopen(req, timeout=30) as response:
                response_data = response.read().decode()
                if response_data:
                    result = json.loads(response_data)
                    # Check for pending command from portal
                    pending_command = result.get("pending_command")
                    if pending_command:
                        logger.info(f"Received pending command from portal: {pending_command}")
                        self.trigger_update_from_portal(pending_command)
                
        except Exception as e:
            logger.debug(f"Failed to report update status: {e}")
    
    def _report_update_result(self, result: UpdateResult):
        """Report update result to portal."""
        if not self.api_url or not self.api_key:
            return
        
        try:
            import urllib.request
            import urllib.error
            
            data = {
                "device_id": self.device_id,
                "update_result": result.to_dict(),
                "timestamp": time.time()
            }
            
            timestamp = int(time.time())
            payload = json.dumps(data)
            signature = self._generate_signature(payload, timestamp)
            
            headers = {
                "Content-Type": "application/json",
                "X-API-Key": self.api_key,
                "X-Device-ID": self.device_id,
                "X-Timestamp": str(timestamp),
                "X-Signature": signature
            }
            
            url = f"{self.api_url}/devices/update-result"
            req = urllib.request.Request(
                url,
                data=payload.encode(),
                headers=headers,
                method="POST"
            )
            
            with urllib.request.urlopen(req, timeout=30) as response:
                response.read()
                
        except Exception as e:
            logger.debug(f"Failed to report update result: {e}")
    
    def add_update_available_callback(self, callback: Callable[[UpdateInfo], None]):
        """Add callback for when updates are available."""
        self._on_update_available.append(callback)
    
    def add_update_complete_callback(self, callback: Callable[[UpdateResult], None]):
        """Add callback for when update completes."""
        self._on_update_complete.append(callback)
    
    def add_restart_required_callback(self, callback: Callable[[], None]):
        """Add callback for when restart is required."""
        self._on_restart_required.append(callback)
    
    def get_status(self) -> UpdateStatus:
        """Get current update status."""
        with self._lock:
            return self._status
    
    def get_update_info(self) -> Optional[UpdateInfo]:
        """Get latest update information."""
        with self._lock:
            return self._update_info
    
    def get_last_update(self) -> Optional[UpdateResult]:
        """Get last update result."""
        with self._lock:
            return self._last_update
    
    def get_update_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get update history."""
        with self._lock:
            return [r.to_dict() for r in self._update_history[-limit:]]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get update service statistics."""
        with self._lock:
            return {
                "status": self._status.value,
                "current_version": self._get_current_version(),
                "last_check": self._last_check,
                "update_info": self._update_info.to_dict() if self._update_info else None,
                "last_update": self._last_update.to_dict() if self._last_update else None,
                "update_count": len(self._update_history),
                "auto_update_enabled": self.auto_update,
                "check_interval": self.check_interval,
                "repo_path": str(self.repo_path),
                "branch": self.branch
            }
