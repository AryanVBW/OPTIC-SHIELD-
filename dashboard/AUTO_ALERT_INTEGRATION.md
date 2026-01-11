# Device Integration for Auto-Alerts

## Overview

To send automatic alerts when the device detects wildlife, the Raspberry Pi device should POST detection data to the dashboard's auto-send endpoint.

## API Endpoint

```
POST https://your-dashboard.vercel.app/api/alerts/auto-send
```

## Headers
```
X-API-Key: your_api_secret_key
X-Device-ID: your_device_id
Content-Type: application/json
```

## Request Body

```json
{
  "detection": {
    "detection_id": 12345,
    "event_id": "evt_abc123",
    "device_id": "device_001",
    "device_name": "Front Camera",
    "camera_id": "cam_01",
    "timestamp": 1705073940,
    "class_name": "tiger",
    "confidence": 0.95,
    "bbox": [100, 150, 400, 500],
    "image_url": "https://your-dashboard.vercel.app/api/detections/12345/image",
    "location": {
      "name": "North Entrance",
      "latitude": 28.6139,
      "longitude": 77.2090
    },
    "metadata": {
      "priority": "high"
    }
  }
}
```

## Response

```json
{
  "success": true,
  "detection": {
    "id": 12345,
    "className": "tiger",
    "confidence": 0.95
  },
  "alertsSent": 3,
  "alertsFailed": 0,
  "recipientCount": 2,
  "messages": [
    {
      "id": "msg_123",
      "recipient": "John Doe",
      "channel": "whatsapp",
      "status": "sent"
    }
  ]
}
```

## Python Integration Example

Add this to `device/src/services/automated_response.py`:

```python
import requests
from typing import Dict, Any

class AutoAlertSender:
    def __init__(self, dashboard_url: str, api_key: str, device_id: str):
        self.dashboard_url = dashboard_url
        self.api_key = api_key
        self.device_id = device_id
    
    def send_auto_alert(self, detection: Dict[str, Any]) -> bool:
        """Send auto-alert to dashboard when wildlife detected"""
        try:
            url = f"{self.dashboard_url}/api/alerts/auto-send"
            headers = {
                "X-API-Key": self.api_key,
                "X-Device-ID": self.device_id,
                "Content-Type": "application/json"
            }
            
            payload = {
                "detection": {
                    "detection_id": detection.get("id"),
                    "event_id": detection.get("event_id"),
                    "device_id": self.device_id,
                    "device_name": detection.get("device_name", "RPi Camera"),
                    "camera_id": detection.get("camera_id", "primary"),
                    "timestamp": int(detection.get("timestamp", time.time())),
                    "class_name": detection.get("class"),
                    "confidence": detection.get("confidence"),
                    "bbox": detection.get("bbox"),
                    "image_url": detection.get("image_url"),
                    "location": detection.get("location"),
                    "metadata": {
                        "priority": detection.get("priority", "medium")
                    }
                }
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            
            result = response.json()
            if result.get("success"):
                logger.info(f"Auto-alerts sent: {result.get('alertsSent')} sent, "
                          f"{result.get('alertsFailed')} failed")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Failed to send auto-alert: {e}")
            return False


# In AutomatedResponseService class, modify _send_alert method:
def _send_alert(self, detection: Dict, priority: str, response: Dict):
    alert = {
        "type": "wildlife_detection",
        "priority": priority,
        "detection": detection,
        "response": response,
        "timestamp": datetime.now().isoformat(),
    }

    # Send to dashboard auto-alert endpoint
    if hasattr(self, 'auto_alert_sender'):
        self.auto_alert_sender.send_auto_alert(detection)
    
    # Existing callback logic
    for callback in self.alert_callbacks:
        try:
            callback(alert)
            self.stats["alerts_sent"] += 1
        except Exception as e:
            logger.error(f"Error in alert callback: {e}")
```

## Configuration

Add to `device/config/config.yaml`:

```yaml
dashboard:
  api_url: "https://your-dashboard.vercel.app/api"
  api_key: "your_api_secret_key"
  auto_alerts_enabled: true
```

## Testing

1. **Configure recipients** in dashboard `/alerts` page:
   - Add recipients
   - Enable "Auto-send alerts on detection" checkbox
   - Save

2. **Test from device**:
```bash
curl -X POST https://your-dashboard.vercel.app/api/alerts/auto-send \
  -H "X-API-Key: your_api_secret_key" \
  -H "X-Device-ID: test_device" \
  -H "Content-Type: application/json" \
  -d '{
    "detection": {
      "detection_id": 999,
      "class_name": "test_animal",
      "confidence": 0.99,
      "timestamp": 1705073940
    }
  }'
```

3. **Check status**:
```bash
curl https://your-dashboard.vercel.app/api/alerts/auto-send/status
```

## Features

- ✅ Automatic alert sending when wildlife detected
- ✅ Multi-channel support (WhatsApp, SMS, Email)
- ✅ Recipient-level auto-alert control
- ✅ Service availability checking
- ✅ Complete audit trail
- ✅ No manual intervention required
