import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, getDeviceStore, broadcastDeviceUpdate } from '@/lib/auth'
import { Device, CameraInfo } from '@/types'

const deviceStore = getDeviceStore()

export async function POST(request: NextRequest) {
  try {
    const authResult = verifyRequest(request)
    if (!authResult.valid) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { device_id, timestamp, status, stats, info } = body

    if (!device_id) {
      return NextResponse.json(
        { success: false, error: 'Device ID required' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    let existingDevice = deviceStore.get(device_id)
    
    if (!existingDevice) {
      existingDevice = {
        id: device_id,
        name: info?.name || device_id,
        status: 'online',
        lastSeen: now,
        location: {
          name: info?.location?.name || 'Unknown',
          latitude: info?.location?.latitude || 0,
          longitude: info?.location?.longitude || 0,
          altitude: info?.location?.altitude,
          timezone: info?.location?.timezone
        },
        stats: {
          uptime: 0,
          detectionCount: 0,
          cpuPercent: 0,
          memoryPercent: 0,
          memoryUsedMb: 0,
          memoryTotalMb: 0,
          temperature: null,
          temperatureUnit: 'celsius',
          storageUsedGb: 0,
          storageTotalGb: 0,
          storagePercent: 0,
          powerConsumptionWatts: null,
          powerSource: 'unknown',
          batteryPercent: null,
          networkLatencyMs: null,
          lastHeartbeat: now
        },
        cameras: [],
        cameraCount: 0,
        firmwareVersion: info?.version || '1.0.0',
        hardwareModel: info?.hardware_model || 'Raspberry Pi 5',
        environment: info?.environment || 'production',
        tags: info?.tags || []
      }
    }

    existingDevice.lastSeen = now
    existingDevice.status = status === 'online' ? 'online' : 'offline'
    
    if (stats) {
      const system = stats.system || {}
      const power = stats.power || {}
      const network = stats.network || {}
      
      existingDevice.stats = {
        uptime: stats.uptime_seconds || existingDevice.stats.uptime,
        detectionCount: stats.detection_count ?? existingDevice.stats.detectionCount,
        cpuPercent: system.cpu_percent ?? existingDevice.stats.cpuPercent,
        memoryPercent: system.memory_percent ?? existingDevice.stats.memoryPercent,
        memoryUsedMb: system.memory_used_mb ?? existingDevice.stats.memoryUsedMb,
        memoryTotalMb: system.memory_total_mb ?? existingDevice.stats.memoryTotalMb,
        temperature: system.temperature_celsius ?? existingDevice.stats.temperature,
        temperatureUnit: 'celsius',
        storageUsedGb: system.disk_used_gb ?? existingDevice.stats.storageUsedGb,
        storageTotalGb: system.disk_total_gb ?? existingDevice.stats.storageTotalGb,
        storagePercent: system.disk_percent ?? existingDevice.stats.storagePercent,
        powerConsumptionWatts: power.consumption_watts ?? existingDevice.stats.powerConsumptionWatts,
        powerSource: power.source ?? existingDevice.stats.powerSource,
        batteryPercent: power.battery_percent ?? existingDevice.stats.batteryPercent,
        networkLatencyMs: network.latency_ms ?? existingDevice.stats.networkLatencyMs,
        lastHeartbeat: now
      }

      if (stats.cameras && Array.isArray(stats.cameras)) {
        existingDevice.cameras = stats.cameras.map((cam: any): CameraInfo => ({
          id: cam.id || `cam-${Math.random().toString(36).substr(2, 9)}`,
          name: cam.name || 'Camera',
          model: cam.model || 'Unknown',
          resolution: cam.resolution || '640x480',
          status: cam.status || 'active'
        }))
        existingDevice.cameraCount = existingDevice.cameras.length
      }
    }

    if (info) {
      if (info.name) existingDevice.name = info.name
      if (info.version) existingDevice.firmwareVersion = info.version
      if (info.hardware_model) existingDevice.hardwareModel = info.hardware_model
      if (info.environment) existingDevice.environment = info.environment
      if (info.tags) existingDevice.tags = info.tags
      if (info.location) {
        existingDevice.location = {
          ...existingDevice.location,
          ...info.location
        }
      }
    }
    
    deviceStore.set(device_id, existingDevice)

    broadcastDeviceUpdate(existingDevice)

    return NextResponse.json({ 
      success: true, 
      message: 'Heartbeat received',
      timestamp: Date.now(),
      device: existingDevice
    })
  } catch (error) {
    console.error('Error processing heartbeat:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process heartbeat' },
      { status: 500 }
    )
  }
}
