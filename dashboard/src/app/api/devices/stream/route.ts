import { NextRequest } from 'next/server'
import { subscribeToDeviceUpdates, getAllDevices } from '@/lib/auth'
import { Device } from '@/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder()
  
  let unsubscribe: (() => void) | null = null
  let isConnectionOpen = true

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: string, data: any) => {
        if (!isConnectionOpen) return
        try {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(message))
        } catch (error) {
          console.error('Error sending SSE event:', error)
        }
      }

      sendEvent('connected', { 
        message: 'Connected to device stream',
        timestamp: new Date().toISOString()
      })

      const devices = getAllDevices()
      sendEvent('devices', { devices })

      unsubscribe = subscribeToDeviceUpdates((device: Device) => {
        sendEvent('device_update', { device })
      })

      const heartbeatInterval = setInterval(() => {
        if (isConnectionOpen) {
          sendEvent('heartbeat', { timestamp: new Date().toISOString() })
        }
      }, 30000)

      request.signal.addEventListener('abort', () => {
        isConnectionOpen = false
        clearInterval(heartbeatInterval)
        if (unsubscribe) {
          unsubscribe()
        }
        try {
          controller.close()
        } catch (e) {
          // Controller may already be closed
        }
      })
    },
    cancel() {
      isConnectionOpen = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
