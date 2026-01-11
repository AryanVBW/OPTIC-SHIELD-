import { NextRequest, NextResponse } from 'next/server'
import { getAlertService } from '@/lib/alert-service'
import { verifyRequest } from '@/lib/auth'
import { Detection } from '@/types'

const alertService = getAlertService()

/**
 * POST /api/alerts/auto-send
 * Automatically send alerts when wildlife is detected (called by device)
 */
export async function POST(request: NextRequest) {
    try {
        // Verify device authentication
        const authResult = verifyRequest(request)
        if (!authResult.valid) {
            return NextResponse.json(
                { success: false, error: authResult.error || 'Unauthorized' },
                { status: 401 }
            )
        }

        const body = await request.json()

        // Validate detection data
        if (!body.detection) {
            return NextResponse.json(
                { success: false, error: 'Detection data is required' },
                { status: 400 }
            )
        }

        // Convert detection payload to Detection type
        const detection: Detection = {
            id: body.detection.detection_id || Date.now(),
            eventId: body.detection.event_id,
            deviceId: body.detection.device_id,
            deviceName: body.detection.device_name || authResult.deviceId || 'Unknown Device',
            cameraId: body.detection.camera_id,
            timestamp: body.detection.timestamp
                ? new Date(body.detection.timestamp * 1000).toISOString()
                : new Date().toISOString(),
            className: body.detection.class_name,
            confidence: body.detection.confidence,
            bbox: body.detection.bbox || [0, 0, 0, 0],
            imageUrl: body.detection.image_url,
            location: body.detection.location,
            metadata: body.detection.metadata
        }

        // Get auto-alert recipients
        const autoRecipients = alertService.getAutoAlertRecipients()

        if (autoRecipients.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No auto-alert recipients configured',
                alertsSent: 0,
            })
        }

        // Send automatic alerts
        const result = await alertService.sendAutoAlerts(detection)

        // Log the automatic alert
        console.log(
            `Auto-alerts sent for ${detection.className}:`,
            `${result.summary.sent} sent, ${result.summary.failed} failed`,
            `to ${autoRecipients.length} recipients`
        )

        return NextResponse.json({
            success: true,
            detection: {
                id: detection.id,
                className: detection.className,
                confidence: detection.confidence,
            },
            alertsSent: result.summary.sent,
            alertsFailed: result.summary.failed,
            recipientCount: autoRecipients.length,
            messages: result.messages.map(m => ({
                id: m.id,
                recipient: m.recipientName,
                channel: m.channel,
                status: m.status,
            })),
        })
    } catch (error: any) {
        console.error('Error in auto-send alerts:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to send automatic alerts' },
            { status: 500 }
        )
    }
}

/**
 * GET /api/alerts/auto-send/status
 * Get auto-alert configuration status
 */
export async function GET(request: NextRequest) {
    try {
        const autoRecipients = alertService.getAutoAlertRecipients()
        const serviceStatus = alertService.getServiceStatus()

        return NextResponse.json({
            success: true,
            enabled: autoRecipients.length > 0,
            recipientCount: autoRecipients.length,
            recipients: autoRecipients.map(r => ({
                id: r.id,
                name: r.name,
                channels: r.preferredChannels,
            })),
            serviceStatus,
        })
    } catch (error: any) {
        console.error('Error getting auto-send status:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to get status' },
            { status: 500 }
        )
    }
}
