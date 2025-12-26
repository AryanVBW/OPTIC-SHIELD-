'use client'

import { useEffect, useState } from 'react'
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react'
import { connectionManager } from '@/lib/connection-manager'
import { StatusIndicator } from './ui/StatusIndicator'
import { Button } from './ui/Button'

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export function ConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [isReconnecting, setIsReconnecting] = useState(false)

  useEffect(() => {
    const unsubscribe = connectionManager.onStatusChange(setStatus)
    connectionManager.start()

    return () => {
      unsubscribe()
    }
  }, [])

  const handleReconnect = async () => {
    setIsReconnecting(true)
    try {
      await connectionManager.forceReconnect()
    } finally {
      setTimeout(() => setIsReconnecting(false), 1000)
    }
  }

  const getStatusProps = () => {
    switch (status) {
      case 'connected':
        return { status: 'online' as const, label: 'Connected' }
      case 'connecting':
        return { status: 'connecting' as const, label: 'Connecting...' }
      case 'error':
        return { status: 'error' as const, label: 'Connection Error' }
      default:
        return { status: 'offline' as const, label: 'Disconnected' }
    }
  }

  return (
    <div className="flex items-center gap-3">
      <StatusIndicator {...getStatusProps()} />
      
      {(status === 'error' || status === 'disconnected') && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReconnect}
          loading={isReconnecting}
          icon={<RefreshCw className="w-4 h-4" />}
        >
          Reconnect
        </Button>
      )}
    </div>
  )
}
