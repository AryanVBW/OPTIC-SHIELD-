import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, getDeviceStore, getDetectionStore, broadcastDeviceUpdate } from '@/lib/auth'
import { Detection, DetectionPayload } from '@/types'

const deviceStore = getDeviceStore()
const detectionStore = getDetectionStore()

// Detection event log for auditing
const detectionEventLog: Array<{
  eventId: string
  deviceId: string
  timestamp: string
  action: string
  details: Record<string, any>
}> = []

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

    const device = deviceStore.get(device_id)
    const deviceName = device?.name || device_id
    const eventId = event_id || `det_${device_id}_${Date.now()}`

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
        uploadTimestamp: metadata.upload_timestamp
      } : undefined
    }

    // Store detection
    const detections = detectionStore.get('all') || []
    detections.unshift(detection)
    
    if (detections.length > 1000) {
      detections.splice(1000)
    }
    detectionStore.set('all', detections)

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
      priority: metadata?.priority
    })

    console.log(`Detection received: ${class_name} (${(confidence * 100).toFixed(1)}%) from ${deviceName}${camera_id ? ` [${camera_id}]` : ''}`)

    return NextResponse.json({ 
      success: true, 
      message: 'Detection recorded',
      event_id: eventId,
      detection_id: detection.id
    })
  } catch (error) {
    console.error('Error recording detection:', error)
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
