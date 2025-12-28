import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, getDeviceStore, getAllDevices, broadcastDeviceUpdate } from '@/lib/auth'
import { Device } from '@/types'

const deviceStore = getDeviceStore()

export async function GET(request: NextRequest) {
  try {
    const devices = getAllDevices()

    return NextResponse.json({ 
      success: true, 
      devices 
    })
  } catch (error) {
    console.error('Error fetching devices:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch devices' },
      { status: 500 }
    )
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

    const body = await request.json()
    const { device_id, info } = body

    if (!device_id) {
      return NextResponse.json(
        { success: false, error: 'Device ID required' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const device: Device = {
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
      cameras: info?.cameras || [],
      cameraCount: info?.cameras?.length || 0,
      firmwareVersion: info?.version || '1.0.0',
      hardwareModel: info?.hardware_model || 'Raspberry Pi 5',
      environment: info?.environment || 'production',
      tags: info?.tags || []
    }

    deviceStore.set(device_id, device)
    broadcastDeviceUpdate(device)

    return NextResponse.json({ 
      success: true, 
      message: 'Device registered',
      device 
    })
  } catch (error) {
    console.error('Error registering device:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to register device' },
      { status: 500 }
    )
  }
}
