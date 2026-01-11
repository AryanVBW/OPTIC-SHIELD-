# OPTIC-SHIELD Dashboard

Web dashboard for monitoring wildlife detection devices. Built with Next.js and designed for deployment on Vercel.

## Features

- **Real-time Device Monitoring**: View status of all connected devices
- **Detection History**: Browse and filter wildlife detections
- **Analytics**: Detection trends and species distribution
- **Bulk Alert System** 🆕: Send WhatsApp, SMS, and Email alerts for wildlife detections
- **Secure API**: JWT-based authentication for device communication

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Edit .env.local with your API secret key
# API_SECRET_KEY=your_secret_key_here

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### Production Deployment (Vercel)

1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard:
   - `API_SECRET_KEY`: Your secret key for device authentication
4. Deploy

```bash
# Or deploy via CLI
vercel deploy --prod
```

## API Endpoints

### Device Registration
```
POST /api/devices
Headers: X-API-Key, X-Device-ID
Body: { device_id, info: { name, location } }
```

### Device Heartbeat
```
POST /api/devices/heartbeat
Headers: X-API-Key, X-Device-ID
Body: { device_id, timestamp, status, stats }
```

### Submit Detection
```
POST /api/devices/detections
Headers: X-API-Key, X-Device-ID
Body: { detection_id, device_id, timestamp, class_name, confidence, bbox, image_base64? }
```

### Batch Detections
```
POST /api/devices/detections/batch
Headers: X-API-Key, X-Device-ID
Body: { device_id, detections: [...] }
```

### Get Detections
```
GET /api/detections?limit=50&device_id=xxx
```

### Get Stats
```
GET /api/stats
```

### Alert System 🆕

#### Get Recipients
```
GET /api/alerts/recipients
Returns: { success: true, recipients: [...], count: number }
```

#### Add Recipient
```
POST /api/alerts/recipients
Body: { name, phone?, email?, preferredChannels: ['whatsapp'|'sms'|'email'], active: true }
```

#### Update Recipient
```
PUT /api/alerts/recipients
Body: { id, ...updates }
```

#### Delete Recipient
```
DELETE /api/alerts/recipients?id=xxx
```

#### Send Bulk Alerts
```
POST /api/alerts/send
Body: {
  detectionIds: [1, 2, 3],
  recipientIds: ['id1', 'id2'],
  channels: ['whatsapp', 'sms', 'email'],
  customMessage?: 'optional message'
}
```

#### Get Alert History
```
GET /api/alerts/history?limit=50&recipient_id=xxx
Returns: { success: true, history: [...], stats: {...} }
```

#### Check Service Status
```
GET /api/alerts/send/status
Returns: { success: true, status: { whatsapp: true, sms: true, email: true } }
```

## Configuration

### Device Configuration

On each Raspberry Pi device, configure the dashboard connection:

```yaml
# device/config/config.prod.yaml
dashboard:
  api_url: "https://your-dashboard.vercel.app/api"
  api_key: "your_api_secret_key"
```

Or via environment variables:
```bash
export OPTIC_DASHBOARD_URL=https://your-dashboard.vercel.app
export OPTIC_API_KEY=your_api_secret_key
```

### Alert System Configuration 🆕

To enable bulk alerts, add these environment variables:

```bash
# Twilio (WhatsApp & SMS)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
TWILIO_SMS_NUMBER=+1234567890

# Resend (Email - FREE 3,000 emails/month)
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=alerts@yourdomain.com
RESEND_FROM_NAME=OPTIC-SHIELD Alerts
```

**Setup Instructions:**

1. **Twilio** (https://www.twilio.com):
   - Create account and get Account SID + Auth Token
   - Purchase a phone number for SMS
   - Enable WhatsApp sandbox for testing

2. **Resend** (https://resend.com - Recommended):
   - FREE tier: 3,000 emails/month
   - Create account and generate API key
   - Verify your domain (optional for testing)

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Charts**: Recharts
- **Alert System**: Twilio (WhatsApp/SMS), Resend (Email)
- **Deployment**: Vercel

## License

MIT License
