import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, getDeviceStore, broadcastDeviceUpdate, getUpdateStatusStore, setDeviceUpdateStatus } from '@/lib/auth'
import { DeviceUpdateStatus } from '@/types'

const updateStatusStore = getUpdateStatusStore()

// POST /api/devices/update-result - Device reports update result
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
    const { device_id, update_result, timestamp } = body

    if (!device_id) {
      return NextResponse.json(
        { success: false, error: 'Device ID required' },
        { status: 400 }
      )
    }

    if (!update_result) {
      return NextResponse.json(
        { success: false, error: 'Update result required' },
        { status: 400 }
      )
    }

    // Get existing status or create new
    const existingStatus = updateStatusStore.get(device_id) || {
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

    // Map the update result
    const mappedResult = {
      success: update_result.success || false,
      status: update_result.status || 'unknown',
      message: update_result.message || '',
      oldVersion: update_result.old_version || '',
      newVersion: update_result.new_version || '',
      timestamp: update_result.timestamp || Date.now() / 1000,
      source: mapSource(update_result.source || 'manual')
    }

    // Update status
    const newStatus: DeviceUpdateStatus = {
      ...existingStatus,
      status: update_result.success ? 'success' : 'failed',
      currentVersion: update_result.new_version || existingStatus.currentVersion,
      updateAvailable: false,
      commitsBehind: 0,
      lastUpdate: mappedResult,
      pendingCommand: null
    }

    updateStatusStore.set(device_id, newStatus)

    // Update device in device store
    const deviceStore = getDeviceStore()
    const device = deviceStore.get(device_id)
    
    if (device) {
      device.updateStatus = newStatus
      
      // Update firmware version if update was successful
      if (update_result.success && update_result.new_version) {
        device.firmwareVersion = update_result.new_version
      }
      
      deviceStore.set(device_id, device)
      broadcastDeviceUpdate(device)
    }

    console.log(`Update result for device ${device_id}:`, {
      success: update_result.success,
      oldVersion: update_result.old_version,
      newVersion: update_result.new_version
    })

    return NextResponse.json({
      success: true,
      message: 'Update result received',
      device_status: newStatus
    })
  } catch (error) {
    console.error('Error processing update result:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process update result' },
      { status: 500 }
    )
  }
}

// Helper function to map source strings to valid enum values
function mapSource(source: string): 'manual' | 'portal' | 'scheduled' | 'auto' {
  const validSources = ['manual', 'portal', 'scheduled', 'auto']
  
  if (validSources.includes(source)) {
    return source as 'manual' | 'portal' | 'scheduled' | 'auto'
  }
  
  return 'manual'
}
