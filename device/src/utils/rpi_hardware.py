#!/usr/bin/env python3
"""
Raspberry Pi Hardware Monitoring Module

Provides comprehensive hardware information and metrics for Raspberry Pi devices.
Supports Raspberry Pi OS and includes GPU, thermal, power, and peripheral monitoring.
"""

import os
import re
import subprocess
import logging
from typing import Dict, List, Optional, Any
from pathlib import Path
import psutil
import platform

logger = logging.getLogger(__name__)


class RaspberryPiHardware:
    """
    Comprehensive Raspberry Pi hardware monitoring.
    
    Provides detailed metrics for:
    - Board information (model, revision, serial)
    - CPU (temperature, frequency, throttling, cores)
    - GPU (temperature, memory, voltage)
    - Memory (RAM, swap, pressure)
    - Storage (health, I/O, space)
    - Network (interfaces, bandwidth)
    - Power (voltage, undervoltage detection)
    - Camera (detection and status)
    - Thermal (comprehensive temperature monitoring)
    """
    
    def __init__(self):
        self.is_raspberry_pi = self._detect_raspberry_pi()
        self._vcgencmd_available = self._check_vcgencmd()
        self._board_info_cache = None
        
    def _detect_raspberry_pi(self) -> bool:
        """Detect if running on Raspberry Pi."""
        try:
            with open('/proc/cpuinfo', 'r') as f:
                cpuinfo = f.read()
                return 'Raspberry Pi' in cpuinfo or 'BCM' in cpuinfo
        except:
            return False
    
    def _check_vcgencmd(self) -> bool:
        """Check if vcgencmd is available."""
        try:
            subprocess.run(['vcgencmd', 'version'], 
                         capture_output=True, check=True, timeout=2)
            return True
        except:
            return False
    
    def _run_vcgencmd(self, command: str) -> Optional[str]:
        """Run vcgencmd and return output."""
        if not self._vcgencmd_available:
            return None
        
        try:
            result = subprocess.run(
                ['vcgencmd'] + command.split(),
                capture_output=True,
                text=True,
                timeout=2
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            logger.debug(f"vcgencmd error: {e}")
        
        return None
    
    def _read_file(self, path: str) -> Optional[str]:
        """Safely read a file."""
        try:
            with open(path, 'r') as f:
                return f.read().strip()
        except:
            return None
    
    def _parse_meminfo(self) -> Dict[str, int]:
        """Parse /proc/meminfo."""
        meminfo = {}
        try:
            with open('/proc/meminfo', 'r') as f:
                for line in f:
                    parts = line.split(':')
                    if len(parts) == 2:
                        key = parts[0].strip()
                        value = parts[1].strip().split()[0]
                        meminfo[key] = int(value)
        except:
            pass
        return meminfo
    
    def get_board_info(self) -> Dict[str, Any]:
        """
        Get comprehensive board information.
        
        Returns:
            dict: Board details including model, revision, serial, memory
        """
        if self._board_info_cache:
            return self._board_info_cache
        
        info = {
            'is_raspberry_pi': self.is_raspberry_pi,
            'model': 'Unknown',
            'revision': 'Unknown',
            'serial': 'Unknown',
            'memory_mb': 0,
            'manufacturer': 'Unknown'
        }
        
        # Parse /proc/cpuinfo
        try:
            with open('/proc/cpuinfo', 'r') as f:
                for line in f:
                    if ':' in line:
                        key, value = line.split(':', 1)
                        key = key.strip().lower()
                        value = value.strip()
                        
                        if key == 'model':
                            info['model'] = value
                        elif key == 'revision':
                            info['revision'] = value
                        elif key == 'serial':
                            info['serial'] = value
        except:
            pass
        
        # Get model from device tree
        model_file = '/proc/device-tree/model'
        if os.path.exists(model_file):
            model = self._read_file(model_file)
            if model:
                info['model'] = model.replace('\x00', '')
        
        # Get total memory
        meminfo = self._parse_meminfo()
        if 'MemTotal' in meminfo:
            info['memory_mb'] = meminfo['MemTotal'] // 1024
        
        # Detect manufacturer
        if 'Raspberry Pi' in info['model']:
            info['manufacturer'] = 'Raspberry Pi Foundation'
        
        self._board_info_cache = info
        return info
    
    def get_cpu_metrics(self) -> Dict[str, Any]:
        """
        Get comprehensive CPU metrics.
        
        Returns:
            dict: CPU temperature, frequency, usage, throttling, cores
        """
        metrics = {
            'temperature_celsius': None,
            'frequency_current_mhz': None,
            'frequency_min_mhz': None,
            'frequency_max_mhz': None,
            'usage_percent': None,
            'usage_per_core': [],
            'core_count': psutil.cpu_count(logical=True),
            'physical_cores': psutil.cpu_count(logical=False),
            'throttled': False,
            'throttled_status': {},
            'load_average_1m': None,
            'load_average_5m': None,
            'load_average_15m': None
        }
        
        # CPU temperature
        temp = self._run_vcgencmd('measure_temp')
        if temp:
            match = re.search(r"temp=(\d+\.?\d*)'C", temp)
            if match:
                metrics['temperature_celsius'] = float(match.group(1))
        
        # Try thermal zone if vcgencmd failed
        if metrics['temperature_celsius'] is None:
            thermal_file = '/sys/class/thermal/thermal_zone0/temp'
            temp_str = self._read_file(thermal_file)
            if temp_str and temp_str.isdigit():
                metrics['temperature_celsius'] = int(temp_str) / 1000.0
        
        # CPU frequency
        freq = self._run_vcgencmd('measure_clock arm')
        if freq:
            match = re.search(r'frequency\(45\)=(\d+)', freq)
            if match:
                metrics['frequency_current_mhz'] = int(match.group(1)) / 1_000_000
        
        # Get frequency limits
        try:
            cpu_freq = psutil.cpu_freq()
            if cpu_freq:
                metrics['frequency_current_mhz'] = cpu_freq.current
                metrics['frequency_min_mhz'] = cpu_freq.min
                metrics['frequency_max_mhz'] = cpu_freq.max
        except:
            pass
        
        # CPU usage
        try:
            metrics['usage_percent'] = psutil.cpu_percent(interval=0.1)
            metrics['usage_per_core'] = psutil.cpu_percent(interval=0.1, percpu=True)
        except:
            pass
        
        # Load average
        try:
            load_avg = os.getloadavg()
            metrics['load_average_1m'] = load_avg[0]
            metrics['load_average_5m'] = load_avg[1]
            metrics['load_average_15m'] = load_avg[2]
        except:
            pass
        
        # Throttling status
        throttled = self._run_vcgencmd('get_throttled')
        if throttled:
            match = re.search(r'throttled=0x([0-9a-fA-F]+)', throttled)
            if match:
                throttled_hex = int(match.group(1), 16)
                metrics['throttled'] = throttled_hex != 0
                metrics['throttled_status'] = {
                    'under_voltage_now': bool(throttled_hex & 0x1),
                    'arm_frequency_capped_now': bool(throttled_hex & 0x2),
                    'currently_throttled': bool(throttled_hex & 0x4),
                    'soft_temp_limit_active': bool(throttled_hex & 0x8),
                    'under_voltage_occurred': bool(throttled_hex & 0x10000),
                    'arm_frequency_capped_occurred': bool(throttled_hex & 0x20000),
                    'throttling_occurred': bool(throttled_hex & 0x40000),
                    'soft_temp_limit_occurred': bool(throttled_hex & 0x80000)
                }
        
        return metrics
    
    def get_gpu_metrics(self) -> Dict[str, Any]:
        """
        Get GPU metrics.
        
        Returns:
            dict: GPU temperature, memory, voltage
        """
        metrics = {
            'temperature_celsius': None,
            'memory_mb': None,
            'core_voltage': None,
            'sdram_c_voltage': None,
            'sdram_i_voltage': None,
            'sdram_p_voltage': None
        }
        
        # GPU/Core temperature
        temp = self._run_vcgencmd('measure_temp')
        if temp:
            match = re.search(r"temp=(\d+\.?\d*)'C", temp)
            if match:
                metrics['temperature_celsius'] = float(match.group(1))
        
        # GPU memory
        mem = self._run_vcgencmd('get_mem gpu')
        if mem:
            match = re.search(r'gpu=(\d+)M', mem)
            if match:
                metrics['memory_mb'] = int(match.group(1))
        
        # Voltages
        voltage_items = [
            ('core', 'core_voltage'),
            ('sdram_c', 'sdram_c_voltage'),
            ('sdram_i', 'sdram_i_voltage'),
            ('sdram_p', 'sdram_p_voltage')
        ]
        
        for vcgencmd_name, metric_name in voltage_items:
            volt = self._run_vcgencmd(f'measure_volts {vcgencmd_name}')
            if volt:
                match = re.search(r'volt=([\d.]+)V', volt)
                if match:
                    metrics[metric_name] = float(match.group(1))
        
        return metrics
    
    def get_memory_metrics(self) -> Dict[str, Any]:
        """
        Get detailed memory metrics.
        
        Returns:
            dict: RAM usage, swap, buffers, cached, available
        """
        metrics = {
            'total_mb': 0,
            'available_mb': 0,
            'used_mb': 0,
            'free_mb': 0,
            'used_percent': 0.0,
            'buffers_mb': 0,
            'cached_mb': 0,
            'swap_total_mb': 0,
            'swap_used_mb': 0,
            'swap_free_mb': 0,
            'swap_percent': 0.0
        }
        
        try:
            mem = psutil.virtual_memory()
            metrics['total_mb'] = mem.total // (1024 * 1024)
            metrics['available_mb'] = mem.available // (1024 * 1024)
            metrics['used_mb'] = mem.used // (1024 * 1024)
            metrics['free_mb'] = mem.free // (1024 * 1024)
            metrics['used_percent'] = mem.percent
            metrics['buffers_mb'] = mem.buffers // (1024 * 1024)
            metrics['cached_mb'] = mem.cached // (1024 * 1024)
            
            swap = psutil.swap_memory()
            metrics['swap_total_mb'] = swap.total // (1024 * 1024)
            metrics['swap_used_mb'] = swap.used // (1024 * 1024)
            metrics['swap_free_mb'] = swap.free // (1024 * 1024)
            metrics['swap_percent'] = swap.percent
        except Exception as e:
            logger.error(f"Error getting memory metrics: {e}")
        
        return metrics
    
    def get_storage_metrics(self) -> Dict[str, Any]:
        """
        Get storage metrics.
        
        Returns:
            dict: Disk usage, I/O stats, mount points
        """
        metrics = {
            'partitions': [],
            'io_stats': {}
        }
        
        # Disk partitions
        try:
            for partition in psutil.disk_partitions(all=False):
                try:
                    usage = psutil.disk_usage(partition.mountpoint)
                    metrics['partitions'].append({
                        'device': partition.device,
                        'mountpoint': partition.mountpoint,
                        'fstype': partition.fstype,
                        'total_mb': usage.total // (1024 * 1024),
                        'used_mb': usage.used // (1024 * 1024),
                        'free_mb': usage.free // (1024 * 1024),
                        'percent': usage.percent
                    })
                except PermissionError:
                    continue
        except Exception as e:
            logger.error(f"Error getting partition info: {e}")
        
        # I/O statistics
        try:
            io_counters = psutil.disk_io_counters()
            if io_counters:
                metrics['io_stats'] = {
                    'read_count': io_counters.read_count,
                    'write_count': io_counters.write_count,
                    'read_bytes': io_counters.read_bytes,
                    'write_bytes': io_counters.write_bytes,
                    'read_time_ms': io_counters.read_time,
                    'write_time_ms': io_counters.write_time
                }
        except Exception as e:
            logger.error(f"Error getting I/O stats: {e}")
        
        return metrics
    
    def get_network_metrics(self) -> Dict[str, Any]:
        """
        Get network metrics.
        
        Returns:
            dict: Interface details, IP addresses, bandwidth
        """
        metrics = {
            'interfaces': [],
            'io_stats': {}
        }
        
        # Network interfaces
        try:
            addrs = psutil.net_if_addrs()
            stats = psutil.net_if_stats()
            
            for interface_name, addresses in addrs.items():
                interface_info = {
                    'name': interface_name,
                    'addresses': [],
                    'is_up': False,
                    'speed_mbps': 0
                }
                
                # Get addresses
                for addr in addresses:
                    if addr.family == 2:  # AF_INET (IPv4)
                        interface_info['addresses'].append({
                            'type': 'ipv4',
                            'address': addr.address,
                            'netmask': addr.netmask
                        })
                    elif addr.family == 10:  # AF_INET6 (IPv6)
                        interface_info['addresses'].append({
                            'type': 'ipv6',
                            'address': addr.address
                        })
                    elif addr.family == 17:  # AF_PACKET (MAC)
                        interface_info['mac_address'] = addr.address
                
                # Get stats
                if interface_name in stats:
                    stat = stats[interface_name]
                    interface_info['is_up'] = stat.isup
                    interface_info['speed_mbps'] = stat.speed
                
                metrics['interfaces'].append(interface_info)
        except Exception as e:
            logger.error(f"Error getting network interfaces: {e}")
        
        # Network I/O
        try:
            io_counters = psutil.net_io_counters()
            if io_counters:
                metrics['io_stats'] = {
                    'bytes_sent': io_counters.bytes_sent,
                    'bytes_recv': io_counters.bytes_recv,
                    'packets_sent': io_counters.packets_sent,
                    'packets_recv': io_counters.packets_recv,
                    'errors_in': io_counters.errin,
                    'errors_out': io_counters.errout,
                    'drops_in': io_counters.dropin,
                    'drops_out': io_counters.dropout
                }
        except Exception as e:
            logger.error(f"Error getting network I/O: {e}")
        
        return metrics
    
    def get_power_metrics(self) -> Dict[str, Any]:
        """
        Get power supply metrics.
        
        Returns:
            dict: Voltage, undervoltage detection
        """
        metrics = {
            'core_voltage': None,
            'undervoltage_detected': False,
            'undervoltage_now': False
        }
        
        # Core voltage
        volt = self._run_vcgencmd('measure_volts core')
        if volt:
            match = re.search(r'volt=([\d.]+)V', volt)
            if match:
                metrics['core_voltage'] = float(match.group(1))
        
        # Undervoltage detection from throttle status
        throttled = self._run_vcgencmd('get_throttled')
        if throttled:
            match = re.search(r'throttled=0x([0-9a-fA-F]+)', throttled)
            if match:
                throttled_hex = int(match.group(1), 16)
                metrics['undervoltage_now'] = bool(throttled_hex & 0x1)
                metrics['undervoltage_detected'] = bool(throttled_hex & 0x10000)
        
        return metrics
    
    def get_camera_status(self) -> Dict[str, Any]:
        """
        Get camera module status.
        
        Returns:
            dict: Camera detection and status
        """
        status = {
            'detected': False,
            'supported': False,
            'cameras': []
        }
        
        # Check for camera using vcgencmd
        result = self._run_vcgencmd('get_camera')
        if result:
            if 'detected=1' in result:
                status['detected'] = True
            if 'supported=1' in result:
                status['supported'] = True
        
        # Check for video devices
        video_devices = Path('/dev').glob('video*')
        for device in video_devices:
            try:
                device_name = device.name
                status['cameras'].append({
                    'device': str(device),
                    'name': device_name
                })
            except:
                pass
        
        return status
    
    def get_thermal_status(self) -> Dict[str, Any]:
        """
        Get comprehensive thermal status.
        
        Returns:
            dict: All temperature sensors
        """
        status = {
            'cpu_temperature': None,
            'gpu_temperature': None,
            'thermal_zones': []
        }
        
        # Get CPU/GPU temp from vcgencmd
        temp = self._run_vcgencmd('measure_temp')
        if temp:
            match = re.search(r"temp=(\d+\.?\d*)'C", temp)
            if match:
                temp_value = float(match.group(1))
                status['cpu_temperature'] = temp_value
                status['gpu_temperature'] = temp_value
        
        # Check all thermal zones
        thermal_path = Path('/sys/class/thermal')
        if thermal_path.exists():
            for zone in thermal_path.glob('thermal_zone*'):
                try:
                    temp_file = zone / 'temp'
                    type_file = zone / 'type'
                    
                    if temp_file.exists() and type_file.exists():
                        temp = int(temp_file.read_text().strip()) / 1000.0
                        zone_type = type_file.read_text().strip()
                        
                        status['thermal_zones'].append({
                            'name': zone_type,
                            'temperature': temp
                        })
                except:
                    continue
        
        return status
    
    def get_system_info(self) -> Dict[str, Any]:
        """
        Get general system information.
        
        Returns:
            dict: OS, kernel, uptime, Python version
        """
        info = {
            'os': platform.system(),
            'os_release': platform.release(),
            'os_version': platform.version(),
            'architecture': platform.machine(),
            'hostname': platform.node(),
            'python_version': platform.python_version(),
            'uptime_seconds': None
        }
        
        # Get uptime
        try:
            with open('/proc/uptime', 'r') as f:
                uptime = float(f.read().split()[0])
                info['uptime_seconds'] = uptime
        except:
            pass
        
        # Get OS details from /etc/os-release
        try:
            with open('/etc/os-release', 'r') as f:
                for line in f:
                    if line.startswith('PRETTY_NAME='):
                        info['os_name'] = line.split('=', 1)[1].strip().strip('"')
        except:
            pass
        
        return info
    
    def get_all_metrics(self) -> Dict[str, Any]:
        """
        Get all available metrics.
        
        Returns:
            dict: Complete system snapshot
        """
        return {
            'board': self.get_board_info(),
            'system': self.get_system_info(),
            'cpu': self.get_cpu_metrics(),
            'gpu': self.get_gpu_metrics(),
            'memory': self.get_memory_metrics(),
            'storage': self.get_storage_metrics(),
            'network': self.get_network_metrics(),
            'power': self.get_power_metrics(),
            'camera': self.get_camera_status(),
            'thermal': self.get_thermal_status()
        }
    
    def check_health(self) -> Dict[str, Any]:
        """
        Check system health and return alerts.
        
        Returns:
            dict: Health status and alerts
        """
        alerts = []
        warnings = []
        
        # Check CPU temperature
        cpu_metrics = self.get_cpu_metrics()
        if cpu_metrics['temperature_celsius']:
            temp = cpu_metrics['temperature_celsius']
            if temp > 80:
                alerts.append(f"Critical CPU temperature: {temp}°C")
            elif temp > 70:
                warnings.append(f"High CPU temperature: {temp}°C")
        
        # Check throttling
        if cpu_metrics.get('throttled'):
            if cpu_metrics['throttled_status'].get('under_voltage_now'):
                alerts.append("Undervoltage detected - insufficient power supply")
            if cpu_metrics['throttled_status'].get('currently_throttled'):
                warnings.append("CPU is currently throttled")
        
        # Check memory
        memory_metrics = self.get_memory_metrics()
        if memory_metrics['used_percent'] > 90:
            alerts.append(f"Critical memory usage: {memory_metrics['used_percent']:.1f}%")
        elif memory_metrics['used_percent'] > 80:
            warnings.append(f"High memory usage: {memory_metrics['used_percent']:.1f}%")
        
        # Check storage
        storage_metrics = self.get_storage_metrics()
        for partition in storage_metrics['partitions']:
            if partition['mountpoint'] == '/':
                if partition['percent'] > 90:
                    alerts.append(f"Critical disk space: {partition['percent']}% used")
                elif partition['percent'] > 80:
                    warnings.append(f"Low disk space: {partition['percent']}% used")
        
        return {
            'healthy': len(alerts) == 0,
            'alerts': alerts,
            'warnings': warnings
        }
