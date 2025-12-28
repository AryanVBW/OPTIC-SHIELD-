import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, getDeviceStore, broadcastDeviceUpdate, getUpdateStatusStore, setDeviceUpdateStatus } from '@/lib/auth'
import { DeviceUpdateStatus } from '@/types'

const updateStatusStore = getUpdateStatusStore()

// POST /api/devices/update - Trigger update on a device
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { device_id, action = 'update' } = body

    if (!device_id) {
      return NextResponse.json(
        { success: false, error: 'Device ID required' },
        { status: 400 }
      )
    }

    // Validate action
    const validActions = ['check', 'update', 'restart']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      )
    }

    // Get device store to verify device exists
    const deviceStore = getDeviceStore()
    const device = deviceStore.get(device_id)

    if (!device) {
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 }
      )
    }

    // Store pending command for device to pick up
    const existingStatus: DeviceUpdateStatus = updateStatusStore.get(device_id) || {
      status: 'idle' as const,
      currentVersion: 'unknown',
      latestVersion: 'unknown',
      updateAvailable: false,
      commitsBehind: 0,
      changes: [],
      lastCheck: 0,
      lastUpdate: null,
      pendingCommand: null
    }

    existingStatus.pendingCommand = {
      action: action as 'check' | 'update' | 'restart',
      timestamp: Date.now(),
      triggeredBy: 'portal'
    }

    updateStatusStore.set(device_id, existingStatus)

    // Broadcast update to connected clients
    broadcastDeviceUpdate({
      ...device,
      updateStatus: existingStatus
    })

    return NextResponse.json({
      success: true,
      message: `Update command '${action}' queued for device ${device_id}`,
      command: existingStatus.pendingCommand
    })
  } catch (error) {
    console.error('Error triggering update:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to trigger update' },
      { status: 500 }
    )
  }
}

// GET /api/devices/update?device_id=xxx - Get update status for a device
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('device_id')

    if (!deviceId) {
      // Return all device update statuses
      const allStatuses: Record<string, any> = {}
      updateStatusStore.forEach((status, id) => {
        allStatuses[id] = status
      })

      return NextResponse.json({
        success: true,
        statuses: allStatuses
      })
    }

    const status = updateStatusStore.get(deviceId)

    if (!status) {
      return NextResponse.json({
        success: true,
        status: {
          status: 'unknown',
          currentVersion: 'unknown',
          latestVersion: 'unknown',
          updateAvailable: false,
          commitsBehind: 0,
          changes: [],
          lastCheck: 0,
          lastUpdate: null,
          pendingCommand: null
        }
      })
    }

    return NextResponse.json({
      success: true,
      status
    })
  } catch (error) {
    console.error('Error getting update status:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get update status' },
      { status: 500 }
    )
  }
}
