"""
Location service for GPS/GNSS integration.
Provides accurate location data for detection events.
"""

import logging
import time
import threading
import json
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class LocationData:
    """GPS/Location data structure."""
    latitude: float = 0.0
    longitude: float = 0.0
    altitude: float = 0.0
    accuracy: float = 0.0  # meters
    speed: float = 0.0  # m/s
    heading: float = 0.0  # degrees
    timestamp: float = field(default_factory=time.time)
    source: str = "config"  # config, gps, network, manual
    satellites: int = 0
    fix_quality: int = 0  # 0=invalid, 1=GPS, 2=DGPS, 3=PPS
    
    def is_valid(self) -> bool:
        """Check if location data is valid."""
        return (
            -90 <= self.latitude <= 90 and
            -180 <= self.longitude <= 180 and
            self.latitude != 0.0 and
            self.longitude != 0.0
        )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "latitude": self.latitude,
            "longitude": self.longitude,
            "altitude": self.altitude,
            "accuracy": self.accuracy,
            "speed": self.speed,
            "heading": self.heading,
            "timestamp": self.timestamp,
            "source": self.source,
            "satellites": self.satellites,
            "fix_quality": self.fix_quality
        }
    
    def to_simple_dict(self) -> Dict[str, Any]:
        """Return simplified location for API."""
        return {
            "latitude": self.latitude,
            "longitude": self.longitude,
            "altitude": self.altitude,
            "accuracy": self.accuracy,
            "source": self.source
        }


class GPSReader:
    """
    GPS/GNSS reader for serial GPS modules.
    Supports NMEA protocol (common for USB/Serial GPS modules).
    """
    
    def __init__(
        self,
        port: str = "/dev/ttyUSB0",
        baudrate: int = 9600,
        timeout: float = 1.0
    ):
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self._serial = None
        self._running = False
        self._last_location: Optional[LocationData] = None
        self._lock = threading.Lock()
    
    def initialize(self) -> bool:
        """Initialize GPS serial connection."""
        try:
            import serial
            self._serial = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=self.timeout
            )
            logger.info(f"GPS initialized on {self.port}")
            return True
        except ImportError:
            logger.warning("pyserial not installed, GPS disabled")
            return False
        except Exception as e:
            logger.warning(f"Failed to initialize GPS: {e}")
            return False
    
    def read_location(self) -> Optional[LocationData]:
        """Read current location from GPS."""
        if not self._serial:
            return None
        
        try:
            line = self._serial.readline().decode('ascii', errors='ignore').strip()
            
            if line.startswith('$GPGGA') or line.startswith('$GNGGA'):
                return self._parse_gga(line)
            elif line.startswith('$GPRMC') or line.startswith('$GNRMC'):
                return self._parse_rmc(line)
                
        except Exception as e:
            logger.debug(f"GPS read error: {e}")
        
        return None
    
    def _parse_gga(self, sentence: str) -> Optional[LocationData]:
        """Parse NMEA GGA sentence."""
        try:
            parts = sentence.split(',')
            if len(parts) < 15:
                return None
            
            # Check for valid fix
            fix_quality = int(parts[6]) if parts[6] else 0
            if fix_quality == 0:
                return None
            
            lat = self._parse_coordinate(parts[2], parts[3])
            lon = self._parse_coordinate(parts[4], parts[5])
            
            if lat is None or lon is None:
                return None
            
            return LocationData(
                latitude=lat,
                longitude=lon,
                altitude=float(parts[9]) if parts[9] else 0.0,
                satellites=int(parts[7]) if parts[7] else 0,
                fix_quality=fix_quality,
                source="gps",
                timestamp=time.time()
            )
            
        except Exception as e:
            logger.debug(f"GGA parse error: {e}")
            return None
    
    def _parse_rmc(self, sentence: str) -> Optional[LocationData]:
        """Parse NMEA RMC sentence."""
        try:
            parts = sentence.split(',')
            if len(parts) < 12:
                return None
            
            # Check for valid status
            if parts[2] != 'A':
                return None
            
            lat = self._parse_coordinate(parts[3], parts[4])
            lon = self._parse_coordinate(parts[5], parts[6])
            
            if lat is None or lon is None:
                return None
            
            speed = float(parts[7]) * 0.514444 if parts[7] else 0.0  # knots to m/s
            heading = float(parts[8]) if parts[8] else 0.0
            
            return LocationData(
                latitude=lat,
                longitude=lon,
                speed=speed,
                heading=heading,
                source="gps",
                timestamp=time.time()
            )
            
        except Exception as e:
            logger.debug(f"RMC parse error: {e}")
            return None
    
    def _parse_coordinate(self, value: str, direction: str) -> Optional[float]:
        """Parse NMEA coordinate format."""
        if not value or not direction:
            return None
        
        try:
            # NMEA format: DDDMM.MMMM
            if '.' in value:
                decimal_pos = value.index('.')
                degrees = float(value[:decimal_pos-2])
                minutes = float(value[decimal_pos-2:])
                coord = degrees + (minutes / 60.0)
                
                if direction in ['S', 'W']:
                    coord = -coord
                
                return coord
        except:
            pass
        
        return None
    
    def close(self):
        """Close GPS connection."""
        if self._serial:
            self._serial.close()
            self._serial = None


class LocationService:
    """
    Location service with multiple data sources.
    
    Priority:
    1. GPS/GNSS module (if available)
    2. Network-based location (if available)
    3. Configuration-based static location
    """
    
    def __init__(
        self,
        default_latitude: float = 0.0,
        default_longitude: float = 0.0,
        default_location_name: str = "Unknown",
        gps_port: Optional[str] = None,
        gps_baudrate: int = 9600,
        update_interval: float = 10.0,
        cache_file: Optional[str] = None
    ):
        self.default_latitude = default_latitude
        self.default_longitude = default_longitude
        self.default_location_name = default_location_name
        self.gps_port = gps_port
        self.gps_baudrate = gps_baudrate
        self.update_interval = update_interval
        self.cache_file = Path(cache_file) if cache_file else None
        
        self._gps_reader: Optional[GPSReader] = None
        self._current_location: Optional[LocationData] = None
        self._location_name: str = default_location_name
        self._lock = threading.Lock()
        
        self._update_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        
        # Stats
        self._gps_fixes = 0
        self._last_gps_fix: Optional[float] = None
    
    def initialize(self) -> bool:
        """Initialize location service."""
        try:
            # Load cached location
            self._load_cached_location()
            
            # Set default location from config
            if not self._current_location:
                self._current_location = LocationData(
                    latitude=self.default_latitude,
                    longitude=self.default_longitude,
                    source="config",
                    timestamp=time.time()
                )
            
            # Try to initialize GPS
            if self.gps_port:
                self._gps_reader = GPSReader(
                    port=self.gps_port,
                    baudrate=self.gps_baudrate
                )
                if self._gps_reader.initialize():
                    logger.info("GPS reader initialized")
                else:
                    self._gps_reader = None
            
            logger.info(f"Location service initialized: {self.get_location_summary()}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize location service: {e}")
            return False
    
    def start(self):
        """Start background location updates."""
        if not self._gps_reader:
            logger.info("No GPS available, using static location")
            return
        
        self._stop_event.clear()
        self._update_thread = threading.Thread(
            target=self._update_loop,
            name="LocationService",
            daemon=True
        )
        self._update_thread.start()
        logger.info("Location service started")
    
    def stop(self):
        """Stop location service."""
        self._stop_event.set()
        
        if self._update_thread and self._update_thread.is_alive():
            self._update_thread.join(timeout=5)
        
        if self._gps_reader:
            self._gps_reader.close()
        
        # Save last known location
        self._save_cached_location()
        
        logger.info("Location service stopped")
    
    def _update_loop(self):
        """Background GPS update loop."""
        while not self._stop_event.is_set():
            try:
                if self._gps_reader:
                    location = self._gps_reader.read_location()
                    if location and location.is_valid():
                        with self._lock:
                            self._current_location = location
                            self._gps_fixes += 1
                            self._last_gps_fix = time.time()
                        
                        # Cache the location
                        self._save_cached_location()
                        
            except Exception as e:
                logger.debug(f"Location update error: {e}")
            
            self._stop_event.wait(self.update_interval)
    
    def get_location(self) -> LocationData:
        """Get current location."""
        with self._lock:
            if self._current_location:
                return self._current_location
            
            return LocationData(
                latitude=self.default_latitude,
                longitude=self.default_longitude,
                source="config"
            )
    
    def get_location_dict(self) -> Dict[str, Any]:
        """Get location as dictionary for API."""
        location = self.get_location()
        return {
            "name": self._location_name,
            **location.to_simple_dict()
        }
    
    def get_location_summary(self) -> str:
        """Get human-readable location summary."""
        location = self.get_location()
        return f"{self._location_name} ({location.latitude:.6f}, {location.longitude:.6f}) [{location.source}]"
    
    def set_location_name(self, name: str):
        """Set location name."""
        self._location_name = name
    
    def set_manual_location(
        self,
        latitude: float,
        longitude: float,
        altitude: float = 0.0
    ):
        """Set location manually."""
        with self._lock:
            self._current_location = LocationData(
                latitude=latitude,
                longitude=longitude,
                altitude=altitude,
                source="manual",
                timestamp=time.time()
            )
        self._save_cached_location()
    
    def _load_cached_location(self):
        """Load cached location from file."""
        if not self.cache_file or not self.cache_file.exists():
            return
        
        try:
            with open(self.cache_file, 'r') as f:
                data = json.load(f)
                self._current_location = LocationData(
                    latitude=data.get("latitude", 0.0),
                    longitude=data.get("longitude", 0.0),
                    altitude=data.get("altitude", 0.0),
                    accuracy=data.get("accuracy", 0.0),
                    source=data.get("source", "cached"),
                    timestamp=data.get("timestamp", time.time())
                )
                self._location_name = data.get("name", self.default_location_name)
                logger.debug(f"Loaded cached location: {self._current_location.latitude}, {self._current_location.longitude}")
        except Exception as e:
            logger.debug(f"Failed to load cached location: {e}")
    
    def _save_cached_location(self):
        """Save current location to cache file."""
        if not self.cache_file:
            return
        
        try:
            self.cache_file.parent.mkdir(parents=True, exist_ok=True)
            
            location = self.get_location()
            data = {
                "name": self._location_name,
                **location.to_dict()
            }
            
            with open(self.cache_file, 'w') as f:
                json.dump(data, f, indent=2)
                
        except Exception as e:
            logger.debug(f"Failed to save cached location: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get location service statistics."""
        location = self.get_location()
        return {
            "current_location": location.to_dict(),
            "location_name": self._location_name,
            "gps_available": self._gps_reader is not None,
            "gps_fixes": self._gps_fixes,
            "last_gps_fix": self._last_gps_fix,
            "source": location.source
        }
