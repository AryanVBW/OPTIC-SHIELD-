import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, getDeviceStore, broadcastDeviceUpdate, getUpdateStatusStore, setDeviceUpdateStatus } from '@/lib/auth'
import { DeviceUpdateStatus } from '@/types'

const updateStatusStore = getUpdateStatusStore()

// POST /api/devices/update-status - Device reports its update status
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
    const { device_id, update_info, current_status, timestamp } = body

    if (!device_id) {
      return NextResponse.json(
        { success: false, error: 'Device ID required' },
        { status: 400 }
      )
    }

    // Get existing status or create new
    const existingStatus = updateStatusStore.get(device_id)
    
    // Map the device's update info to our status format
    const newStatus: DeviceUpdateStatus = {
      status: mapStatus(current_status || 'idle'),
      currentVersion: update_info?.current_version || existingStatus?.currentVersion || 'unknown',
      latestVersion: update_info?.latest_version || existingStatus?.latestVersion || 'unknown',
      updateAvailable: update_info?.available || false,
      commitsBehind: update_info?.commits_behind || 0,
      changes: update_info?.changes || [],
      lastCheck: update_info?.checked_at || timestamp || Date.now() / 1000,
      lastUpdate: existingStatus?.lastUpdate || null,
      pendingCommand: existingStatus?.pendingCommand || null
    }

    updateStatusStore.set(device_id, newStatus)

    // Update device in device store with update status
    const deviceStore = getDeviceStore()
    const device = deviceStore.get(device_id)
    
    if (device) {
      device.updateStatus = newStatus
      deviceStore.set(device_id, device)
      broadcastDeviceUpdate(device)
    }

    // Check if there's a pending command for this device
    const pendingCommand = newStatus.pendingCommand
    
    // Clear the pending command after sending it
    if (pendingCommand) {
      newStatus.pendingCommand = null
      updateStatusStore.set(device_id, newStatus)
    }

    return NextResponse.json({
      success: true,
      message: 'Update status received',
      pending_command: pendingCommand
    })
  } catch (error) {
    console.error('Error processing update status:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process update status' },
      { status: 500 }
    )
  }
}

// Helper function to map status strings to valid enum values
function mapStatus(status: string): DeviceUpdateStatus['status'] {
  const validStatuses: DeviceUpdateStatus['status'][] = [
    'idle', 'checking', 'downloading', 'applying', 'restarting', 'success', 'failed', 'up_to_date'
  ]
  
  if (validStatuses.includes(status as DeviceUpdateStatus['status'])) {
    return status as DeviceUpdateStatus['status']
  }
  
  return 'idle'
}
