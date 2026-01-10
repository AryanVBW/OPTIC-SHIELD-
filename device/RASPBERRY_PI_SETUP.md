# Raspberry Pi Deployment Guide

## Quick Start for Raspberry Pi 5

### Hardware Requirements
- Raspberry Pi 5 (4GB+ RAM recommended)
- Pi Camera Module 3 or USB camera
- 32GB+ microSD card or NVMe SSD
- 5V/5A USB-C power supply (official recommended)
- Optional: 4G LTE HAT for cellular connectivity

### 1. Initial Setup

```bash
# System update
sudo apt update && sudo apt upgrade -y

# Install system dependencies
sudo apt install -y python3-pip python3-venv git libatlas-base-dev

# Enable camera
sudo raspi-config
# Navigate to: Interface Options → Camera → Enable

# Reboot
sudo reboot
```

### 2. Install OPTIC-SHIELD

```bash
# Clone repository
cd ~
git clone https://github.com/yourusername/OPTIC-SHIELD.git
cd OPTIC-SHIELD/device

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# For Raspberry Pi specific features
pip install picamera2  # Pi Camera support
# pip install RPi.GPIO  # GPIO alerts (optional)
```

### 3. Configuration

```bash
# Copy production config
cp config/config.yaml config/config.prod.yaml

# Edit configuration
nano config/config.prod.yaml
```

**Important settings to configure:**
```yaml
device:
  id: ""  # Leave empty for auto-generation
  name: "rpi-wildlife-001"  # Unique name for your device
  location:
    name: "Forest Station Alpha"
    latitude: 37.7749
    longitude: -122.4194

dashboard:
  api_url: "https://your-dashboard.vercel.app/api"
  api_key: "your-api-key-here"

# Hardware monitoring is pre-configured
# Crash handling is enabled by default
# Detection automation is ready to use
```

### 4. Set Environment Variables

```bash
# Create environment file
nano ~/.bashrc

# Add these lines
export OPTIC_ENV=production
export OPTIC_DEVICE_SECRET="your-secret-key-here"

# Reload
source ~/.bashrc
```

### 5. Test the System

```bash
# Activate environment
source venv/bin/activate

# Run validation
python scripts/validate_setup.py

# Test hardware monitoring
python -c "from src.utils.rpi_hardware import RaspberryPiHardware; h = RaspberryPiHardware(); import json; print(json.dumps(h.get_all_metrics(), indent=2))"

# Start in development mode (for testing)
OPTIC_ENV=development python main.py
```

---

## System Service Setup

### Create Systemd Service

```bash
sudo nano /etc/systemd/system/optic-shield.service
```

**Service Configuration:**
```ini
[Unit]
Description=OPTIC-SHIELD Wildlife Detection System
Documentation=https://github.com/yourusername/OPTIC-SHIELD
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=/home/pi/OPTIC-SHIELD/device

# Environment variables
Environment="OPTIC_ENV=production"
Environment="OPTIC_DEVICE_SECRET=your-secret-key"
Environment="PATH=/home/pi/OPTIC-SHIELD/device/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Main process
ExecStart=/home/pi/OPTIC-SHIELD/device/venv/bin/python /home/pi/OPTIC-SHIELD/device/main.py

# Restart configuration
Restart=always
RestartSec=10
StartLimitInterval=200
StartLimitBurst=5

# Resource limits
LimitNOFILE=65535
MemoryLimit=1G

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=optic-shield

[Install]
WantedBy=multi-user.target
```

### Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable optic-shield

# Start service
sudo systemctl start optic-shield

# Check status
sudo systemctl status optic-shield

# View logs
sudo journalctl -u optic-shield -f
```

---

## Hardware Watchdog Setup

### Enable Hardware Watchdog

```bash
# Load watchdog module
sudo modprobe bcm2835_wdt

# Make it load on boot
echo "bcm2835_wdt" | sudo tee -a /etc/modules

# Install watchdog daemon (backup to application watchdog)
sudo apt install -y watchdog

# Configure watchdog
sudo nano /etc/watchdog.conf
```

**Watchdog Configuration:**
```ini
# Watchdog device
watchdog-device = /dev/watchdog

# Check interval (seconds)
interval = 10

# Watchdog timeout (seconds)
watchdog-timeout = 30

# System checks
max-load-1 = 24
min-memory = 100000

# Log file
log-dir = /var/log/watchdog
```

```bash
# Enable watchdog service
sudo systemctl enable watchdog
sudo systemctl start watchdog
```

---

## Performance Tuning

### Optimize for 24/7 Operation

```bash
# Disable unnecessary services
sudo systemctl disable bluetooth
sudo systemctl disable avahi-daemon

# Disable swap (if using SSD/NVMe)
sudo swapoff -a
sudo nano /etc/fstab  # Comment out swap line

# Set CPU governor to performance
echo "performance" | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Make permanent
sudo nano /etc/rc.local
# Add before "exit 0":
# echo performance | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
```

### Temperature Management

```bash
# Install cooling management
sudo apt install -y fancontrol

# For active cooling (if you have a fan)
sudo nano /boot/config.txt
# Add:
# dtoverlay=gpio-fan,gpiopin=14,temp=60000
```

---

## Monitoring & Maintenance

### View System Status

```bash
# Service status
sudo systemctl status optic-shield

# Real-time logs
sudo journalctl -u optic-shield -f

# Check hardware metrics
vcgencmd measure_temp  # CPU temperature
vcgencmd get_throttled  # Throttling status
vcgencmd measure_volts core  # Core voltage

# System resources
htop
```

### Health Checks

```bash
# Check if watchdog is running
ps aux | grep watchdog

# Check crash reports
ls -lh ~/OPTIC-SHIELD/device/data/crash_reports/

# Check telemetry
tail -f ~/OPTIC-SHIELD/device/logs/optic-shield.log | grep "telemetry"

# Check detection stats
tail -f ~/OPTIC-SHIELD/device/logs/optic-shield.log | grep "detection"
```

### Maintenance Tasks

```bash
# Update OPTIC-SHIELD
cd ~/OPTIC-SHIELD
git pull
sudo systemctl restart optic-shield

# Clean old crash reports (keeps last 30 days)
# (Automatic via crash handler)

# Clean old images (keeps last 30 days)
# (Automatic via storage cleanup)

# Manual cleanup
sudo journalctl --vacuum-time=7d  # Keep 7 days of logs
```

---

## Troubleshooting

### Common Issues

**1. Camera Not Detected**
```bash
# Check camera
libcamera-hello  # Should show camera preview

# Check device
ls -l /dev/video*

# Enable legacy camera
sudo raspi-config
# Legacy Camera → Enable
```

**2. High CPU Temperature**
```bash
# Check temperature
vcgencmd measure_temp

# Check throttling
vcgencmd get_throttled
# 0x0 = No throttling
# 0x50000 = Throttled in the past

# Solutions:
# - Add heatsink
# - Add active cooling (fan)
# - Improve ventilation
# - Reduce detection FPS in config
```

**3. Undervoltage Warnings**
```bash
# Check power
vcgencmd get_throttled

# Solutions:
# - Use official 5V/5A power supply
# - Use shorter/thicker USB-C cable
# - Remove power-hungry USB devices
```

**4. Service Won't Start**
```bash
# Check logs
sudo journalctl -u optic-shield -n 100

# Check permissions
ls -l /home/pi/OPTIC-SHIELD/device/

# Check Python environment
source ~/OPTIC-SHIELD/device/venv/bin/activate
python --version
pip list
```

**5. High Memory Usage**
```bash
# Check memory
free -h

# Reduce memory usage:
# Edit config.yaml
# detection:
#   batch_size: 1  # Reduce from higher values

# Restart service
sudo systemctl restart optic-shield
```

---

## Remote Access

### SSH Access

```bash
# Enable SSH
sudo raspi-config
# Interface Options → SSH → Enable

# From another computer
ssh pi@<raspberry-pi-ip>
```

### VPN for Secure Remote Access

```bash
# Install WireGuard
sudo apt install -y wireguard

# Or use Tailscale (easier)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

---

## Security Best Practices

1. **Change Default Password**
```bash
passwd
```

2. **Enable Firewall**
```bash
sudo apt install -y ufw
sudo ufw allow ssh
sudo ufw enable
```

3. **Automatic Security Updates**
```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades
```

4. **Regular Backups**
```bash
# Backup configuration
tar -czf optic-shield-config-$(date +%Y%m%d).tar.gz ~/OPTIC-SHIELD/device/config/

# Backup data
tar -czf optic-shield-data-$(date +%Y%m%d).tar.gz ~/OPTIC-SHIELD/device/data/
```

---

## Hardware Specifications

### Tested Configuration
- **Board**: Raspberry Pi 5 (8GB RAM)
- **Storage**: 256GB NVMe SSD (via NVMe HAT)
- **Camera**: Pi Camera Module 3
- **Cooling**: Active cooling with 5V fan
- **Power**: Official 27W USB-C power supply
- **Connectivity**: Ethernet + 4G LTE HAT
-** Case**: Aluminum case with heatsink

### Performance Metrics
- **Detection Speed**: ~94ms per image (~10 FPS)
- **CPU Usage**: 40-60% (4 cores)
- **Memory Usage**: ~400MB
- **CPU Temperature**: 45-55°C (with active cooling)
- **Storage I/O**: <5MB/s average
- **Network**: ~10KB/s average (uploads)

---

## Production Checklist

- [ ] Raspberry Pi OS installed and updated
- [ ] Camera module detected and working
- [ ] OPTIC-SHIELD installed and configured
- [ ] Production config.yaml configured
- [ ] Environment variables set
- [ ] System service enabled
- [ ] Hardware watchdog enabled
- [ ] Initial test run completed
- [ ] Dashboard connection verified
- [ ] Remote access configured
- [ ] Firewall enabled
- [ ] Automatic updates enabled
- [ ] Physical enclosure installed
- [ ] Power supply verified (5V/5A)
- [ ] Cooling solution installed
- [ ] Backup configuration saved

---

## Support

For issues or questions:
1. Check logs: `sudo journalctl -u optic-shield -f`
2. Review crash reports: `~/OPTIC-SHIELD/device/data/crash_reports/`
3. Check hardware health via dashboard
4. Review documentation: https://github.com/yourusername/OPTIC-SHIELD

---

## License

MIT License - See LICENSE file for details.
