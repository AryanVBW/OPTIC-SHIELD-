import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, getDeviceStore, getDetectionStore, broadcastDeviceUpdate } from '@/lib/auth'
import { Detection, DetectionPayload } from '@/types'
import crypto from 'crypto'

const deviceStore = getDeviceStore()
const detectionStore = getDetectionStore()

// Wild cat species filter - ONLY these species are allowed
const WILD_CAT_SPECIES = [
  'tiger',
  'leopard',
  'jaguar',
  'lion',
  'cheetah',
  'snow leopard',
  'clouded leopard',
  'puma',
  'lynx'
]

function isWildCat(className: string): boolean {
  return WILD_CAT_SPECIES.includes(className.toLowerCase())
}

// Acknowledgment store for guaranteed delivery
const ackStore = new Map<string, {
  ackId: string
  eventId: string
  deviceId: string
  receivedAt: string
  processedAt: string
  status: 'received' | 'processed' | 'failed'
  checksum?: string
}>()

// Deduplication store (event_id -> timestamp)
const deduplicationStore = new Map<string, number>()
const DEDUP_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

// Detection event log for auditing
const detectionEventLog: Array<{
  eventId: string
  deviceId: string
  timestamp: string
  action: string
  details: Record<string, any>
}> = []

function generateAckId(): string {
  return `ack_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`
}

function isDuplicate(eventId: string): boolean {
  const now = Date.now()
  
  // Clean old entries
  const entries = Array.from(deduplicationStore.entries())
  entries.forEach(([id, timestamp]) => {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      deduplicationStore.delete(id)
    }
  })
  
  if (deduplicationStore.has(eventId)) {
    return true
  }
  
  deduplicationStore.set(eventId, now)
  return false
}

function verifyChecksum(payload: any, providedChecksum?: string): boolean {
  if (!providedChecksum) return true // Checksum optional
  
  const payloadStr = JSON.stringify({
    event_id: payload.event_id,
    device_id: payload.device_id,
    class_name: payload.class_name,
    confidence: payload.confidence,
    timestamp: payload.timestamp
  })
  
  const computed = crypto.createHash('sha256').update(payloadStr).digest('hex').substring(0, 16)
  return computed === providedChecksum
}

function logDetectionEvent(eventId: string, deviceId: string, action: string, details: Record<string, any>) {
  detectionEventLog.unshift({
    eventId,
    deviceId,
    timestamp: new Date().toISOString(),
    action,
    details
  })
  // Keep only last 1000 events
  if (detectionEventLog.length > 1000) {
    detectionEventLog.splice(1000)
  }
}

export async function POST(request: NextRequest) {
  const receivedAt = new Date().toISOString()
  const messageId = request.headers.get('X-Message-ID') || ''
  
  try {
    const authResult = verifyRequest(request)
    if (!authResult.valid) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: DetectionPayload = await request.json()
    const { 
      event_id,
      detection_id, 
      device_id, 
      camera_id,
      timestamp, 
      class_name, 
      class_id,
      confidence, 
      bbox, 
      image_base64,
      location,
      metadata 
    } = body

    if (!device_id || !class_name) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const eventId = event_id || `det_${device_id}_${Date.now()}`

    // Check for duplicate (idempotency)
    if (isDuplicate(eventId)) {
      // Return success for duplicate - already processed
      const existingAck = ackStore.get(eventId)
      console.log(`Duplicate detection ignored: ${eventId}`)
      return NextResponse.json({
        success: true,
        message: 'Detection already processed (duplicate)',
        event_id: eventId,
        ack_id: existingAck?.ackId || generateAckId(),
        duplicate: true
      })
    }

    // Verify checksum if provided
    const providedChecksum = metadata?.message_checksum
    if (!verifyChecksum(body, providedChecksum)) {
      logDetectionEvent(eventId, device_id, 'checksum_failed', { providedChecksum })
      return NextResponse.json(
        { success: false, error: 'Checksum verification failed' },
        { status: 400 }
      )
    }

    // Validate that detection is a wild cat species only
    if (!isWildCat(class_name)) {
      console.log(`Rejected non-wild-cat detection: ${class_name} from ${device_id}`)
      return NextResponse.json(
        { success: false, error: 'Only wild cat species are allowed' },
        { status: 400 }
      )
    }

    const device = deviceStore.get(device_id)
    const deviceName = device?.name || device_id

    // Generate acknowledgment ID
    const ackId = generateAckId()

    // Create enhanced detection record
    const detection: Detection = {
      id: detection_id || Date.now(),
      eventId: eventId,
      deviceId: device_id,
      deviceName: deviceName,
      cameraId: camera_id,
      timestamp: new Date(timestamp * 1000).toISOString(),
      className: class_name,
      confidence: confidence,
      bbox: bbox || [],
      imageUrl: image_base64 ? `data:image/jpeg;base64,${image_base64}` : undefined,
      location: location ? {
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude
      } : undefined,
      metadata: metadata ? {
        processingTimeMs: metadata.processing_time_ms,
        priority: metadata.priority,
        frameTimestamp: metadata.frame_timestamp,
        deviceInfo: metadata.device_info,
        uploadTimestamp: metadata.upload_timestamp,
        ackId: ackId,
        receivedAt: receivedAt
      } : { ackId: ackId, receivedAt: receivedAt }
    }

    // Store detection
    const detections = detectionStore.get('all') || []
    detections.unshift(detection)
    
    if (detections.length > 1000) {
      detections.splice(1000)
    }
    detectionStore.set('all', detections)

    // Store acknowledgment for guaranteed delivery tracking
    ackStore.set(eventId, {
      ackId,
      eventId,
      deviceId: device_id,
      receivedAt,
      processedAt: new Date().toISOString(),
      status: 'processed',
      checksum: providedChecksum
    })

    // Clean old acks (keep last 10000)
    if (ackStore.size > 10000) {
      const keys = Array.from(ackStore.keys())
      keys.slice(0, keys.length - 10000).forEach(k => ackStore.delete(k))
    }

    // Update device status to reflect active detection
    if (device) {
      device.stats.detectionCount = (device.stats.detectionCount || 0) + 1
      device.lastSeen = new Date().toISOString()
      device.status = 'online'
      deviceStore.set(device_id, device)
      
      // Broadcast device update for real-time dashboard
      broadcastDeviceUpdate(device)
    }

    // Log detection event for auditing
    logDetectionEvent(eventId, device_id, 'detection_received', {
      className: class_name,
      confidence,
      hasImage: !!image_base64,
      cameraId: camera_id,
      location: location?.name,
      priority: metadata?.priority,
      ackId,
      messageId
    })

    console.log(`Detection received: ${class_name} (${(confidence * 100).toFixed(1)}%) from ${deviceName}${camera_id ? ` [${camera_id}]` : ''} [ack: ${ackId}]`)

    // Return with acknowledgment for guaranteed delivery
    return NextResponse.json({ 
      success: true, 
      message: 'Detection recorded and acknowledged',
      event_id: eventId,
      detection_id: detection.id,
      ack_id: ackId,
      received_at: receivedAt,
      processed_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error recording detection:', error)
    
    // Log failed detection
    logDetectionEvent(messageId || 'unknown', 'unknown', 'detection_failed', {
      error: String(error)
    })
    
    return NextResponse.json(
      { success: false, error: 'Failed to record detection' },
      { status: 500 }
    )
  }
}

// GET endpoint to retrieve detection event logs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('device_id')
    const limit = parseInt(searchParams.get('limit') || '100')

    let logs = detectionEventLog
    if (deviceId) {
      logs = logs.filter(log => log.deviceId === deviceId)
    }

    return NextResponse.json({
      success: true,
      logs: logs.slice(0, limit),
      count: logs.length
    })
  } catch (error) {
    console.error('Error fetching detection logs:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch detection logs' },
      { status: 500 }
    )
  }
}
