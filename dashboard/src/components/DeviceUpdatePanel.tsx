'use client'

import { useState } from 'react'
import { RefreshCw, Download, RotateCcw, Check, AlertCircle, Clock, GitBranch } from 'lucide-react'
import { DeviceUpdateStatus } from '@/types'
import { Button } from './ui/Button'
import { apiClient } from '@/lib/api-client'

interface DeviceUpdatePanelProps {
  deviceId: string
  deviceName: string
  updateStatus?: DeviceUpdateStatus
  onUpdateTriggered?: () => void
}

export function DeviceUpdatePanel({ 
  deviceId, 
  deviceName, 
  updateStatus,
  onUpdateTriggered 
}: DeviceUpdatePanelProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const triggerAction = async (action: 'check' | 'update' | 'restart') => {
    setLoading(action)
    setError(null)
    setSuccess(null)

    try {
      const response = await apiClient.post<{ success: boolean; message: string }>('/api/devices/update', {
        device_id: deviceId,
        action
      })

      if (response.success) {
        setSuccess(response.message || `${action} command sent successfully`)
        onUpdateTriggered?.()
      } else {
        setError('Failed to send command')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send command')
    } finally {
      setLoading(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
      case 'up_to_date':
        return 'text-emerald-500'
      case 'failed':
        return 'text-red-500'
      case 'checking':
      case 'downloading':
      case 'applying':
      case 'restarting':
        return 'text-amber-500'
      default:
        return 'text-slate-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
      case 'up_to_date':
        return <Check className="w-4 h-4" />
      case 'failed':
        return <AlertCircle className="w-4 h-4" />
      case 'checking':
      case 'downloading':
      case 'applying':
      case 'restarting':
        return <RefreshCw className="w-4 h-4 animate-spin" />
      default:
        return <Clock className="w-4 h-4" />
    }
  }

  const formatTimestamp = (timestamp: number) => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp * 1000)
    return date.toLocaleString()
  }

  return (
    <div className="bg-surface/50 dark:bg-slate-900/50 rounded-xl border border-border dark:border-slate-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-primary-500" />
          <h3 className="font-semibold text-foreground">Software Updates</h3>
        </div>
        {updateStatus && (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${getStatusColor(updateStatus.status)}`}>
            {getStatusIcon(updateStatus.status)}
            <span className="capitalize">{updateStatus.status.replace('_', ' ')}</span>
          </div>
        )}
      </div>

      {/* Version Info */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface dark:bg-slate-950/50 rounded-lg p-3 border border-border dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Current Version</div>
          <div className="font-mono text-sm font-medium text-foreground">
            {updateStatus?.currentVersion || 'Unknown'}
          </div>
        </div>
        <div className="bg-surface dark:bg-slate-950/50 rounded-lg p-3 border border-border dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Latest Version</div>
          <div className="font-mono text-sm font-medium text-foreground">
            {updateStatus?.latestVersion || 'Unknown'}
          </div>
        </div>
      </div>

      {/* Update Available Banner */}
      {updateStatus?.updateAvailable && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Download className="w-4 h-4" />
            <span className="font-medium text-sm">
              Update Available - {updateStatus.commitsBehind} commit{updateStatus.commitsBehind !== 1 ? 's' : ''} behind
            </span>
          </div>
          {updateStatus.changes && updateStatus.changes.length > 0 && (
            <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              <div className="font-medium mb-1">Recent changes:</div>
              <ul className="space-y-0.5 max-h-20 overflow-y-auto">
                {updateStatus.changes.slice(0, 5).map((change, idx) => (
                  <li key={idx} className="truncate font-mono">{change}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Last Update Info */}
      {updateStatus?.lastUpdate && (
        <div className="bg-surface dark:bg-slate-950/50 rounded-lg p-3 mb-4 border border-border dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">Last Update</div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {updateStatus.lastUpdate.success ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm font-medium ${updateStatus.lastUpdate.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {updateStatus.lastUpdate.success ? 'Successful' : 'Failed'}
              </span>
            </div>
            <span className="text-xs text-slate-500">
              {formatTimestamp(updateStatus.lastUpdate.timestamp)}
            </span>
          </div>
          {updateStatus.lastUpdate.message && (
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 truncate">
              {updateStatus.lastUpdate.message}
            </div>
          )}
        </div>
      )}

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm">
            <Check className="w-4 h-4" />
            <span>{success}</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => triggerAction('check')}
          disabled={loading !== null}
          icon={<RefreshCw className={`w-4 h-4 ${loading === 'check' ? 'animate-spin' : ''}`} />}
        >
          Check for Updates
        </Button>
        
        <Button
          variant="primary"
          size="sm"
          onClick={() => triggerAction('update')}
          disabled={loading !== null || !updateStatus?.updateAvailable}
          icon={<Download className={`w-4 h-4 ${loading === 'update' ? 'animate-spin' : ''}`} />}
        >
          Apply Update
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => triggerAction('restart')}
          disabled={loading !== null}
          icon={<RotateCcw className={`w-4 h-4 ${loading === 'restart' ? 'animate-spin' : ''}`} />}
        >
          Restart Service
        </Button>
      </div>

      {/* Last Check Time */}
      {updateStatus?.lastCheck && updateStatus.lastCheck > 0 && (
        <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Last checked: {formatTimestamp(updateStatus.lastCheck)}
        </div>
      )}
    </div>
  )
}
