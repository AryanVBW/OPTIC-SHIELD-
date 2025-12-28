# OPTIC-SHIELD 🦁🛡️

**Production-Grade Wildlife Detection System with Guaranteed Delivery**

A fault-tolerant, production-ready wildlife detection system designed for deployment in remote areas with unreliable connectivity. The system ensures **zero missed detections** through robust message queuing, acknowledgment-based delivery, and self-healing capabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RASPBERRY PI 5 (Field Device)                           │
│  ┌──────────┐   ┌────────────┐   ┌─────────────┐   ┌──────────────────────┐ │
│  │ Pi Camera│──▶│ YOLO11n    │──▶│ Detection   │──▶│ Guaranteed Delivery  │ │
│  │ + GPS    │   │ Detector   │   │ Service     │   │ Service              │ │
│  └──────────┘   └────────────┘   └─────────────┘   └──────────────────────┘ │
│       │               │                │                      │              │
│       ▼               ▼                ▼                      ▼              │
│  ┌─────────┐   ┌──────────┐    ┌───────────┐    ┌────────────────────────┐  │
│  │Location │   │ ~94ms/   │    │  SQLite   │    │   Message Broker       │  │
│  │Service  │   │ ~10 FPS  │    │  Storage  │    │ • Dead Letter Queue    │  │
│  └─────────┘   └──────────┘    └───────────┘    │ • Circuit Breaker      │  │
│       │                              │          │ • Exponential Backoff  │  │
│       ▼                              ▼          │ • Acknowledgment-based │  │
│  ┌─────────────────────────────────────────┐    └────────────────────────┘  │
│  │         Health Monitor                   │              │                 │
│  │  • Component health checks               │              │                 │
│  │  • Self-healing & auto-recovery          │              │                 │
│  │  • Metrics collection & alerting         │              │                 │
│  └─────────────────────────────────────────┘              │                 │
└───────────────────────────────────────────────────────────│─────────────────┘
                                                            │
                                                            ▼ (HTTPS + ACK)
                              ┌─────────────────────────────────────────────┐
                              │         VERCEL DASHBOARD (Cloud)            │
                              │  • Acknowledgment-based message receipt     │
                              │  • Deduplication & checksum verification    │
                              │  • Real-time device monitoring              │
                              │  • Detection history & analytics            │
                              │  • Multi-device management                  │
                              └─────────────────────────────────────────────┘
```

## Key Features

### 🎯 Zero Missed Detections
- **Guaranteed Delivery**: Every detection is persisted and retried until acknowledged
- **Message Broker**: SQLite-backed persistent queue with 50,000+ message capacity
- **Dead Letter Queue**: Failed messages preserved for manual review/replay
- **Acknowledgment Protocol**: Server confirms receipt with unique ACK ID
- **Checksum Verification**: End-to-end data integrity validation

### 🔄 Fault Tolerance
- **Circuit Breaker**: Prevents cascading failures during network outages
- **Exponential Backoff**: Intelligent retry with jitter (30s to 1hr)
- **Self-Healing**: Automatic component recovery (camera, detector)
- **Offline Buffering**: Survives days of connectivity loss
- **Graceful Degradation**: Continues detection even when upload fails

### 🦁 Wildlife Detection
- **YOLO11n + NCNN**: ~94ms inference, ~10 FPS on Raspberry Pi 5
- **Configurable Species**: Tiger, leopard, lion, and other wild cats
- **Priority Handling**: Dangerous animals (tiger, leopard) get critical priority
- **High-Quality Capture**: Automatic image capture at detection moment
- **Confidence Filtering**: Configurable threshold to reduce false positives

### 📍 Location & Metadata
- **GPS Integration**: Optional NMEA GPS module support
- **Location Caching**: Persists last known location across restarts
- **Full Metadata**: Device ID, camera ID, GPS coordinates, timestamp, confidence
- **Audit Trail**: Complete event logging for compliance

### 📊 Health Monitoring
- **Component Health Checks**: Camera, detector, delivery, storage
- **System Metrics**: CPU, memory, disk, temperature monitoring
- **Alert System**: Configurable thresholds with cooldown
- **Self-Healing Actions**: Automatic recovery attempts

### 🌐 Web Dashboard
- **Real-time Monitoring**: Live device status and detections
- **Detection History**: Browse and filter with image viewer
- **Acknowledgment Tracking**: View delivery status per detection
- **Multi-device Support**: Manage fleet of field devices

## Project Structure

```
OPTIC-SHIELD/
├── device/                     # Raspberry Pi service
│   ├── config/                 # Configuration files
│   │   ├── config.yaml         # Main configuration (delivery, health, location)
│   │   ├── config.dev.yaml     # Development overrides
│   │   └── config.prod.yaml    # Production overrides
│   ├── src/
│   │   ├── core/               # Core detection engine
│   │   │   ├── detector.py     # YOLO wildlife detector
│   │   │   ├── camera.py       # Camera management
│   │   │   └── config.py       # Configuration management
│   │   ├── services/           # Background services
│   │   │   ├── detection_service.py    # Main detection orchestrator
│   │   │   ├── delivery_service.py     # Guaranteed delivery (NEW)
│   │   │   ├── health_monitor.py       # Health & self-healing (NEW)
│   │   │   ├── location_service.py     # GPS/location (NEW)
│   │   │   ├── alert_service.py        # Alert management
│   │   │   ├── upload_service.py       # Legacy upload
│   │   │   └── event_logger.py         # Audit logging
│   │   ├── storage/            # Persistent storage
│   │   │   ├── message_broker.py       # Message broker with DLQ (NEW)
│   │   │   ├── offline_queue.py        # Offline queue
│   │   │   ├── database.py             # SQLite database
│   │   │   └── image_store.py          # Image storage
│   │   ├── api/                # Dashboard API client
│   │   └── utils/              # Utilities
│   ├── models/                 # YOLO model files
│   ├── scripts/                # Deployment scripts
│   ├── main.py                 # Entry point
│   └── requirements.txt        # Python dependencies
│
├── dashboard/                  # Vercel web dashboard
│   ├── src/
│   │   ├── app/
│   │   │   └── api/
│   │   │       └── devices/
│   │   │           └── detections/     # Detection API with ACK
│   │   ├── components/         # React components
│   │   ├── lib/                # Utilities & API
│   │   └── types/              # TypeScript types
│   ├── package.json
│   └── vercel.json
│
└── docs/                       # Documentation
```

## Quick Start

### 1. Raspberry Pi Setup (Automated)

```bash
# Clone repository
git clone https://github.com/yourusername/OPTIC-SHIELD.git
cd OPTIC-SHIELD/device

# Run auto-setup (detects platform, installs dependencies, validates)
bash scripts/auto_setup.sh

# The script will:
# ✓ Detect your OS and hardware
# ✓ Install all dependencies
# ✓ Create virtual environment
# ✓ Set up directories
# ✓ Run validation checks
# ✓ Generate "Tested OK" report
```

### 2. Validate Setup

```bash
# Run validation to check all 19 components
python scripts/validate_setup.py

# Run tests
python scripts/run_tests.py
```

### 3. Run the Service

```bash
# Activate virtual environment
source venv/bin/activate

# Run in development mode
OPTIC_ENV=development python main.py

# Or start as system service (Linux)
sudo systemctl start optic-shield
```

### 4. Dashboard Deployment


```bash
cd dashboard
npm install
npm run dev     # Development
# or
vercel deploy   # Production
```

## Configuration

The system uses a layered configuration approach:
- `config.yaml` - Base configuration
- `config.dev.yaml` - Development overrides
- `config.prod.yaml` - Production overrides

Set environment via `OPTIC_ENV=development|production`

### Environment Variables

```bash
# Required
OPTIC_ENV=production              # Environment (development|production)
OPTIC_API_KEY=your-api-key        # Dashboard API key
OPTIC_DASHBOARD_URL=https://...   # Dashboard URL

# Optional
OPTIC_DEVICE_ID=device-001        # Override device ID
OPTIC_DEVICE_SECRET=secret        # HMAC signing secret
OPTIC_GPS_PORT=/dev/ttyUSB0       # GPS serial port
OPTIC_DEBUG=1                     # Enable debug logging
```

### Key Configuration Sections

```yaml
# Guaranteed Delivery (config.yaml)
delivery:
  enabled: true
  interval_seconds: 5           # How often to process queue
  batch_size: 10                # Messages per batch
  max_queue_size: 50000         # Max queued messages
  max_retry_attempts: 10        # Retries before dead-letter
  circuit_breaker:
    failure_threshold: 5        # Failures before circuit opens
    recovery_timeout_seconds: 60

# Health Monitoring
health:
  enabled: true
  check_interval_seconds: 30
  self_healing_enabled: true
  cpu_critical_percent: 95
  memory_critical_percent: 95

# Location/GPS
location:
  gps_port: ""                  # Leave empty to disable GPS
  cache_enabled: true           # Cache location to file
```

## Hardware Requirements

### Raspberry Pi 5
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 32GB+ SSD (via NVMe HAT)
- **Camera**: Pi Camera Module 3 or compatible
- **Cellular**: 4G LTE HAT (SIM7600 recommended)
- **GPS** (Optional): USB NMEA GPS module
- **Power**: 5V/5A USB-C or solar + battery

## Guaranteed Delivery Flow

```
Detection Event
      │
      ▼
┌─────────────────┐
│ Message Broker  │ ◄── Persistent SQLite storage
│ (Publish)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Pending Queue   │────▶│ In-Flight       │
│ (Priority-based)│     │ (With ACK token)│
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
           ┌───────────────┐         ┌───────────────┐
           │ ACK Received  │         │ NACK/Timeout  │
           │ (Delete msg)  │         │ (Retry/DLQ)   │
           └───────────────┘         └───────────────┘
                                            │
                              ┌─────────────┴─────────────┐
                              │                           │
                              ▼                           ▼
                     ┌───────────────┐          ┌───────────────┐
                     │ Retry Queue   │          │ Dead Letter   │
                     │ (Exp backoff) │          │ Queue (DLQ)   │
                     └───────────────┘          └───────────────┘
```

## API Response Format

Detection upload responses include acknowledgment:

```json
{
  "success": true,
  "message": "Detection recorded and acknowledged",
  "event_id": "det_device001_1703789123456_1",
  "detection_id": 1,
  "ack_id": "ack_1703789123456_a1b2c3d4",
  "received_at": "2024-12-28T21:45:23.456Z",
  "processed_at": "2024-12-28T21:45:23.489Z"
}
```

## Monitoring & Debugging

### Health Report Endpoint
The device exposes health information via `get_stats()`:

```python
stats = app.get_stats()
# Returns:
{
  "device_id": "device-001",
  "version": "2.0.0",
  "health": {
    "overall_status": "healthy",
    "components": {
      "camera": {"status": "healthy"},
      "detector": {"status": "healthy"},
      "delivery": {"status": "healthy"}
    }
  },
  "delivery_service": {
    "metrics": {
      "success_rate": 99.5,
      "consecutive_failures": 0
    },
    "broker": {
      "queue_pending": 5,
      "dead_letter_queue": 0
    }
  }
}
```

### Dead Letter Queue Management
Failed messages can be replayed:

```python
# Replay failed messages
delivery_service.replay_failed_messages(limit=10)

# View dead letter queue
dlq_messages = broker.get_dead_letter_messages(limit=100)
```

## License

MIT License - See LICENSE file for details.
