import { NextRequest, NextResponse } from 'next/server'
import { getDeviceById, getTelemetryHistory } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  try {
    const { deviceId } = params
    
    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: 'Device ID required' },
        { status: 400 }
      )
    }

    const device = getDeviceById(deviceId)
    
    if (!device) {
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 }
      )
    }

    const telemetryHistory = getTelemetryHistory(deviceId)

    return NextResponse.json({
      success: true,
      device,
      telemetryHistory
    })
  } catch (error) {
    console.error('Error fetching device:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch device' },
      { status: 500 }
    )
  }
}
