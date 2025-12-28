'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Device } from '@/types'

interface StreamState {
  devices: Device[]
  isConnected: boolean
  lastUpdate: Date | null
  error: string | null
}

interface UseDeviceStreamOptions {
  onDeviceUpdate?: (device: Device) => void
  onConnect?: () => void
  onDisconnect?: () => void
  autoReconnect?: boolean
  reconnectDelay?: number
}

export function useDeviceStream(options: UseDeviceStreamOptions = {}) {
  const {
    onDeviceUpdate,
    onConnect,
    onDisconnect,
    autoReconnect = true,
    reconnectDelay = 3000
  } = options

  const [state, setState] = useState<StreamState>({
    devices: [],
    isConnected: false,
    lastUpdate: null,
    error: null
  })

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)

  const updateDevice = useCallback((updatedDevice: Device) => {
    setState(prev => {
      const existingIndex = prev.devices.findIndex(d => d.id === updatedDevice.id)
      let newDevices: Device[]
      
      if (existingIndex >= 0) {
        newDevices = [...prev.devices]
        newDevices[existingIndex] = updatedDevice
      } else {
        newDevices = [...prev.devices, updatedDevice]
      }

      return {
        ...prev,
        devices: newDevices,
        lastUpdate: new Date()
      }
    })

    onDeviceUpdate?.(updatedDevice)
  }, [onDeviceUpdate])

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    try {
      const eventSource = new EventSource('/api/devices/stream')
      eventSourceRef.current = eventSource

      eventSource.addEventListener('connected', (event) => {
        if (!mountedRef.current) return
        setState(prev => ({ ...prev, isConnected: true, error: null }))
        onConnect?.()
      })

      eventSource.addEventListener('devices', (event) => {
        if (!mountedRef.current) return
        try {
          const data = JSON.parse(event.data)
          if (data.devices) {
            setState(prev => ({
              ...prev,
              devices: data.devices,
              lastUpdate: new Date()
            }))
          }
        } catch (e) {
          console.error('Error parsing devices event:', e)
        }
      })

      eventSource.addEventListener('device_update', (event) => {
        if (!mountedRef.current) return
        try {
          const data = JSON.parse(event.data)
          if (data.device) {
            updateDevice(data.device)
          }
        } catch (e) {
          console.error('Error parsing device_update event:', e)
        }
      })

      eventSource.addEventListener('heartbeat', (event) => {
        if (!mountedRef.current) return
        setState(prev => ({ ...prev, lastUpdate: new Date() }))
      })

      eventSource.onerror = (error) => {
        if (!mountedRef.current) return
        console.error('SSE connection error:', error)
        
        setState(prev => ({
          ...prev,
          isConnected: false,
          error: 'Connection lost'
        }))
        
        onDisconnect?.()
        eventSource.close()
        eventSourceRef.current = null

        if (autoReconnect && mountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect()
            }
          }, reconnectDelay)
        }
      }
    } catch (error) {
      console.error('Failed to create EventSource:', error)
      setState(prev => ({
        ...prev,
        isConnected: false,
        error: 'Failed to connect'
      }))
    }
  }, [autoReconnect, reconnectDelay, onConnect, onDisconnect, updateDevice])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    setState(prev => ({ ...prev, isConnected: false }))
  }, [])

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, [connect, disconnect])

  const getDeviceById = useCallback((deviceId: string): Device | undefined => {
    return state.devices.find(d => d.id === deviceId)
  }, [state.devices])

  const getOnlineDevices = useCallback((): Device[] => {
    return state.devices.filter(d => d.status === 'online')
  }, [state.devices])

  const getOfflineDevices = useCallback((): Device[] => {
    return state.devices.filter(d => d.status === 'offline')
  }, [state.devices])

  return {
    ...state,
    connect,
    disconnect,
    getDeviceById,
    getOnlineDevices,
    getOfflineDevices
  }
}
