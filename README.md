# OPTIC-SHIELD 🦁🛡️

**Offline Wild Animal Detection & Reporting System for Raspberry Pi 5**

A production-ready, deeply optimized wildlife detection system designed for deployment in residential areas over cellular networks. The system runs entirely offline on Raspberry Pi 5 with YOLO11n + NCNN for real-time detection, sending alerts only when animals are detected.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                 RASPBERRY PI 5 (Field Device)                    │
│  ┌──────────┐   ┌────────────┐   ┌─────────────┐   ┌─────────┐ │
│  │ Pi Camera│──▶│ YOLO11n    │──▶│ Detection   │──▶│ Alert   │ │
│  │          │   │ (NCNN)     │   │ Logger      │   │ Manager │ │
│  └──────────┘   └────────────┘   └─────────────┘   └─────────┘ │
│                       │                │                │       │
│                       ▼                ▼                ▼       │
│                 ┌──────────┐    ┌───────────┐    ┌──────────┐  │
│                 │ 94ms/img │    │  SQLite   │    │ Cellular │  │
│                 │ ~10 FPS  │    │  Storage  │    │  Upload  │  │
│                 └──────────┘    └───────────┘    └──────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (HTTPS/WSS)
                    ┌─────────────────────────────────────┐
                    │     VERCEL DASHBOARD (Cloud)        │
                    │  • Real-time device monitoring      │
                    │  • Detection history & analytics    │
                    │  • Multi-device management          │
                    │  • Bulk alert system (NEW) 🚨       │
                    │    - WhatsApp notifications         │
                    │    - SMS alerts                     │
                    │    - Email alerts                   │
                    └─────────────────────────────────────┘
```

## Features

### Raspberry Pi Service
- **Optimized Detection**: YOLO11n + NCNN (~94ms inference, ~10 FPS)
- **100% Offline Operation**: All detection runs locally
- **Robust Error Handling**: Auto-recovery, watchdog, graceful degradation
- **Continuous Operation**: Designed for 24/7 unattended deployment
- **Low Resource Usage**: Optimized for RPi5's 4GB/8GB RAM
- **Local Storage**: SQLite database + image storage with auto-cleanup
- **Cellular Alerts**: Minimal bandwidth usage (JSON + compressed images)

### Bulk Alert System 🆕
- **Multi-Channel Notifications**: Send alerts via WhatsApp, SMS, and Email
- **Recipient Management**: Add, edit, and manage alert recipients
- **Bulk Sending**: Send alerts to multiple recipients simultaneously
- **Rich Content**: Includes detection images, GPS location, Google Maps links
- **Alert History**: Complete audit trail of all sent alerts
- **Free Email Service**: 3,000 free emails/month via Resend
- **Service Integrations**:
  - WhatsApp & SMS via Twilio
  - Email via Resend (completely free tier)
- **Smart Formatting**: Beautiful HTML emails and rich WhatsApp messages

### Detection-to-Portal Upload System
- **Automatic Photo Capture**: Captures image at moment of detection
- **Secure Image Upload**: Compressed images uploaded to portal with metadata
- **Offline Queue**: Persistent SQLite-backed queue survives restarts
- **Intermittent Connectivity**: Automatic retry with exponential backoff
- **Event Logging**: Complete audit trail of all detection events
- **Priority Handling**: High-priority animals (bear, elephant, etc.) uploaded immediately
- **Full Metadata**: Device ID, camera ID, location, timestamp, confidence

### Web Dashboard (Vercel)
- **Real-time Monitoring**: Live device status and detections
- **Multi-device Support**: Manage multiple field devices
- **Detection History**: Browse and filter past detections with images
- **Image Viewer**: Click any detection to view captured image with metadata
- **Analytics**: Detection trends, species distribution
- **Bulk Alert System** 🆕:
  - Send WhatsApp, SMS, and Email alerts
  - Manage recipient list (add/edit/delete)
  - Select detections and recipients for bulk sending
  - Alert history and statistics
  - Beautiful HTML email templates with detection images
  - GPS location with Google Maps integration
- **Secure API**: JWT authentication, HTTPS only

## Project Structure

```
OPTIC-SHIELD/
├── device/                     # Raspberry Pi service
│   ├── config/                 # Configuration files
│   │   ├── config.yaml         # Main configuration
│   │   ├── config.dev.yaml     # Development overrides
│   │   └── config.prod.yaml    # Production overrides
│   ├── src/                    # Source code
│   │   ├── core/               # Core detection engine
│   │   ├── services/           # Background services
│   │   ├── api/                # API client for dashboard
│   │   ├── storage/            # Database & file storage
│   │   └── utils/              # Utilities
│   ├── models/                 # YOLO model files
│   ├── scripts/                # Deployment scripts
│   ├── main.py                 # Entry point
│   └── requirements.txt        # Python dependencies
│
├── dashboard/                  # Vercel web dashboard
│   ├── src/
│   │   ├── app/                # Next.js app router
│   │   ├── components/         # React components
│   │   ├── lib/                # Utilities & API
│   │   └── types/              # TypeScript types
│   ├── public/                 # Static assets
│   ├── package.json
│   └── vercel.json
│
└── docs/                       # Documentation
    ├── setup-rpi.md            # Raspberry Pi setup guide
    ├── setup-dashboard.md      # Dashboard deployment guide
    └── api.md                  # API documentation
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

# Configure environment variables (see .env.local.example)
cp .env.local.example .env.local

# Add your API credentials:
# - TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (for WhatsApp/SMS)
# - RESEND_API_KEY (for Email - FREE 3,000 emails/month)
# - API_SECRET_KEY (for device authentication)

npm run dev     # Development
# or
vercel deploy   # Production
```

#### Alert System Setup (Optional)

To enable bulk alerts via WhatsApp, SMS, and Email:

1. **Twilio** (WhatsApp & SMS):
   - Sign up at https://www.twilio.com
   - Get Account SID and Auth Token
   - Get a phone number for SMS
   - Enable WhatsApp sandbox

2. **Resend** (Email - FREE):
   - Sign up at https://resend.com
   - Create an API key
   - FREE tier: 3,000 emails/month

3. **Configure** `.env.local`:
   ```bash
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
   TWILIO_SMS_NUMBER=+1234567890
   RESEND_API_KEY=re_your_api_key
   RESEND_FROM_EMAIL=alerts@yourdomain.com
   ```

4. **Access**: Navigate to `/alerts` in the dashboard to manage recipients and send alerts

## Configuration

The system uses a layered configuration approach:
- `config.yaml` - Base configuration
- `config.dev.yaml` - Development overrides
- `config.prod.yaml` - Production overrides

Set environment via `OPTIC_ENV=development|production`

## Hardware Requirements

### Raspberry Pi 5
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 32GB+ SSD (via NVMe HAT)
- **Camera**: Pi Camera Module 3 or compatible
- **Cellular**: 4G LTE HAT (SIM7600 recommended)
- **Power**: 5V/5A USB-C or solar + battery

## License

MIT License - See LICENSE file for details.
