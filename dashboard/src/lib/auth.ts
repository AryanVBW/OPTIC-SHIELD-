import { NextRequest } from 'next/server'
import { Device, Detection, DeviceTelemetry } from '@/types'

const API_SECRET_KEY = process.env.API_SECRET_KEY || 'development-key'

const deviceStore = new Map<string, Device>()
const detectionStore = new Map<string, Detection[]>()
const deviceUpdateCallbacks: Set<(device: Device) => void> = new Set()
const telemetryHistory = new Map<string, DeviceTelemetry[]>()

export function getDeviceStore(): Map<string, Device> {
  return deviceStore
}

export function getDetectionStore(): Map<string, Detection[]> {
  return detectionStore
}

export interface AuthResult {
  valid: boolean
  deviceId?: string
  error?: string
}

export function verifyRequest(request: NextRequest): AuthResult {
  const apiKey = request.headers.get('X-API-Key')
  const deviceId = request.headers.get('X-Device-ID')
  const timestamp = request.headers.get('X-Timestamp')
  const signature = request.headers.get('X-Signature')

  if (!apiKey) {
    return { valid: false, error: 'Missing API key' }
  }

  if (apiKey !== API_SECRET_KEY) {
    return { valid: false, error: 'Invalid API key' }
  }

  if (!deviceId) {
    return { valid: false, error: 'Missing device ID' }
  }

  if (timestamp) {
    const requestTime = parseInt(timestamp)
    const now = Math.floor(Date.now() / 1000)
    const timeDiff = Math.abs(now - requestTime)
    
    if (timeDiff > 300) {
      return { valid: false, error: 'Request timestamp too old' }
    }
  }

  return { valid: true, deviceId }
}

export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function subscribeToDeviceUpdates(callback: (device: Device) => void): () => void {
  deviceUpdateCallbacks.add(callback)
  return () => deviceUpdateCallbacks.delete(callback)
}

export function broadcastDeviceUpdate(device: Device): void {
  deviceUpdateCallbacks.forEach(callback => {
    try {
      callback(device)
    } catch (error) {
      console.error('Error in device update callback:', error)
    }
  })
  
  const telemetry: DeviceTelemetry = {
    deviceId: device.id,
    timestamp: new Date().toISOString(),
    cpu: device.stats.cpuPercent,
    memory: device.stats.memoryPercent,
    temperature: device.stats.temperature,
    storage: device.stats.storagePercent,
    power: device.stats.powerConsumptionWatts,
    status: device.status === 'maintenance' ? 'offline' : device.status
  }
  
  const history = telemetryHistory.get(device.id) || []
  history.push(telemetry)
  if (history.length > 100) {
    history.shift()
  }
  telemetryHistory.set(device.id, history)
}

export function getTelemetryHistory(deviceId: string): DeviceTelemetry[] {
  return telemetryHistory.get(deviceId) || []
}

export function getAllDevices(): Device[] {
  const now = Date.now()
  return Array.from(deviceStore.values()).map(device => ({
    ...device,
    status: (now - new Date(device.lastSeen).getTime()) < 120000 
      ? device.status === 'maintenance' ? 'maintenance' : 'online' 
      : 'offline'
  }))
}

export function getDeviceById(deviceId: string): Device | undefined {
  const device = deviceStore.get(deviceId)
  if (!device) return undefined
  
  const now = Date.now()
  const isRecent = (now - new Date(device.lastSeen).getTime()) < 120000
  return {
    ...device,
    status: isRecent 
      ? device.status === 'maintenance' ? 'maintenance' : 'online' 
      : 'offline'
  }
}
