'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Cpu, 
  HardDrive, 
  Thermometer, 
  MapPin, 
  Clock, 
  Activity,
  Camera,
  Zap,
  Battery,
  Wifi,
  WifiOff,
  Server,
  Globe,
  RefreshCw,
  Settings,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react'
import { Device, DeviceTelemetry } from '@/types'
import { apiClient } from '@/lib/api-client'
import { useDeviceStream } from '@/lib/useDeviceStream'
import { formatDistanceToNow, format } from 'date-fns'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Badge } from '@/components/ui/Badge'
import { StatusIndicator } from '@/components/ui/StatusIndicator'

interface DeviceDetailResponse {
  success: boolean
  device: Device
  telemetryHistory: DeviceTelemetry[]
}

export default function DeviceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const deviceId = params.deviceId as string

  const [device, setDevice] = useState<Device | null>(null)
  const [telemetryHistory, setTelemetryHistory] = useState<DeviceTelemetry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const { 
    getDeviceById, 
    isConnected: isStreamConnected 
  } = useDeviceStream({
    onDeviceUpdate: useCallback((updatedDevice: Device) => {
      if (updatedDevice.id === deviceId) {
        setDevice(updatedDevice)
      }
    }, [deviceId])
  })

  useEffect(() => {
    const streamDevice = getDeviceById(deviceId)
    if (streamDevice) {
      setDevice(streamDevice)
    }
  }, [deviceId, getDeviceById])

  const fetchDeviceData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true)

    try {
      const data = await apiClient.get<DeviceDetailResponse>(`/api/devices/${deviceId}`)
      
      if (data.success && data.device) {
        if (!isStreamConnected) {
          setDevice(data.device)
        }
        setTelemetryHistory(data.telemetryHistory || [])
        setError(null)
      } else {
        setError('Device not found')
      }
    } catch (err) {
      console.error('Error fetching device:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch device data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [deviceId, isStreamConnected])

  useEffect(() => {
    fetchDeviceData()
    const interval = setInterval(() => fetchDeviceData(), 5000)
    return () => clearInterval(interval)
  }, [fetchDeviceData])

  const handleRefresh = () => {
    fetchDeviceData(true)
  }

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-emerald-400'
      case 'offline': return 'text-slate-500'
      case 'error': return 'text-red-400'
      case 'maintenance': return 'text-amber-400'
      default: return 'text-slate-400'
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'online': return 'bg-emerald-500/10 border-emerald-500/30'
      case 'offline': return 'bg-slate-500/10 border-slate-500/30'
      case 'error': return 'bg-red-500/10 border-red-500/30'
      case 'maintenance': return 'bg-amber-500/10 border-amber-500/30'
      default: return 'bg-slate-500/10 border-slate-500/30'
    }
  }

  const getCameraStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-4 h-4 text-emerald-400" />
      case 'inactive': return <XCircle className="w-4 h-4 text-slate-500" />
      case 'error': return <AlertTriangle className="w-4 h-4 text-red-400" />
      default: return <XCircle className="w-4 h-4 text-slate-500" />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading device data...</p>
        </div>
      </div>
    )
  }

  if (error || !device) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Device Not Found</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">{error || 'The requested device could not be found.'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const isOnline = device.status === 'online'

  return (
    <div className="min-h-screen bg-background text-slate-900 dark:text-slate-100">
      {/* Background Ambient Glow */}
      <div className="fixed top-0 left-0 w-full h-[500px] bg-gradient-to-b from-primary-900/10 via-slate-900/5 to-transparent pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-fade-in-up">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700/50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{device.name}</h1>
                <div className={`px-3 py-1 rounded-full border ${getStatusBg(device.status)} flex items-center gap-2`}>
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span className={`text-sm font-medium capitalize ${getStatusColor(device.status)}`}>
                    {device.status}
                  </span>
                </div>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
                ID: <span className="font-mono text-slate-700 dark:text-slate-300">{device.id}</span>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Real-time connection indicator */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              isStreamConnected 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {isStreamConnected ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span>Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>Polling</span>
                </>
              )}
            </div>
            
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm">Refresh</span>
            </button>
            <button className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700/50 transition-colors">
              <Settings className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Device Info & Location */}
          <div className="space-y-6 animate-fade-in-up animation-delay-200">
            {/* Device Info Card */}
            <Card variant="glass" className="border-white/5">
              <CardHeader className="border-b border-slate-800/50">
                <CardTitle icon={<Server className="w-5 h-5 text-primary-400" />}>
                  Device Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Hardware Model</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{device.hardwareModel}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Firmware Version</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{device.firmwareVersion}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Environment</p>
                    <Badge variant={device.environment === 'production' ? 'success' : 'info'} size="sm">
                      {device.environment}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1">Uptime</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{formatUptime(device.stats.uptime)}</p>
                  </div>
                </div>
                
                {device.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-2">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {device.tags.map((tag, i) => (
                        <span key={i} className="px-2 py-1 text-xs bg-slate-200 dark:bg-slate-800 rounded-md text-slate-700 dark:text-slate-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Location Card */}
            <Card variant="glass" className="border-slate-200 dark:border-white/5">
              <CardHeader className="border-b border-slate-200 dark:border-slate-800/50">
                <CardTitle icon={<Globe className="w-5 h-5 text-accent-400" />}>
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-accent-500/10">
                    <MapPin className="w-5 h-5 text-accent-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{device.location.name}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      {device.location.latitude.toFixed(6)}°, {device.location.longitude.toFixed(6)}°
                    </p>
                    {device.location.altitude && (
                      <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                        Altitude: {device.location.altitude}m
                      </p>
                    )}
                    {device.location.timezone && (
                      <p className="text-xs text-slate-500 dark:text-slate-500">
                        Timezone: {device.location.timezone}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Map Placeholder */}
                <div className="h-40 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-300 dark:border-slate-800 flex items-center justify-center overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary-900/20 to-accent-900/20" />
                  <div className="relative text-center">
                    <MapPin className="w-8 h-8 text-primary-400 mx-auto mb-2 animate-bounce" />
                    <p className="text-xs text-slate-500 dark:text-slate-500">Map View</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cameras Card */}
            <Card variant="glass" className="border-slate-200 dark:border-white/5">
              <CardHeader className="border-b border-slate-200 dark:border-slate-800/50">
                <CardTitle 
                  icon={<Camera className="w-5 h-5 text-warning-400" />}
                  badge={
                    <Badge variant="info" size="sm">
                      {device.cameraCount} Camera{device.cameraCount !== 1 ? 's' : ''}
                    </Badge>
                  }
                >
                  Cameras
                </CardTitle>
              </CardHeader>
              <CardContent>
                {device.cameras.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 dark:text-slate-500">
                    <Camera className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No cameras configured</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {device.cameras.map((camera, index) => (
                      <div 
                        key={camera.id} 
                        className="p-3 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getCameraStatusIcon(camera.status)}
                            <span className="font-medium text-slate-900 dark:text-white text-sm">{camera.name}</span>
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-500 font-mono">{camera.id}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-500 dark:text-slate-500">Model:</span>
                            <span className="text-slate-700 dark:text-slate-300 ml-1">{camera.model}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-500">Resolution:</span>
                            <span className="text-slate-700 dark:text-slate-300 ml-1">{camera.resolution}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Middle & Right Columns - Metrics */}
          <div className="lg:col-span-2 space-y-6 animate-fade-in-up animation-delay-400">
            {/* Real-time Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* CPU */}
              <MetricCard
                icon={<Cpu className="w-5 h-5" />}
                label="CPU Usage"
                value={`${device.stats.cpuPercent.toFixed(1)}%`}
                color="blue"
                progress={device.stats.cpuPercent}
                isOnline={isOnline}
              />
              
              {/* Memory */}
              <MetricCard
                icon={<HardDrive className="w-5 h-5" />}
                label="RAM Usage"
                value={`${device.stats.memoryPercent.toFixed(1)}%`}
                subValue={`${device.stats.memoryUsedMb.toFixed(0)} / ${device.stats.memoryTotalMb.toFixed(0)} MB`}
                color="violet"
                progress={device.stats.memoryPercent}
                isOnline={isOnline}
              />
              
              {/* Temperature */}
              <MetricCard
                icon={<Thermometer className="w-5 h-5" />}
                label="Temperature"
                value={device.stats.temperature !== null ? `${device.stats.temperature.toFixed(1)}°C` : 'N/A'}
                color="amber"
                progress={device.stats.temperature ? Math.min(device.stats.temperature, 100) : 0}
                isOnline={isOnline}
                warning={device.stats.temperature !== null && device.stats.temperature > 70}
              />
              
              {/* Storage */}
              <MetricCard
                icon={<Server className="w-5 h-5" />}
                label="Storage"
                value={`${device.stats.storagePercent.toFixed(1)}%`}
                subValue={`${device.stats.storageUsedGb.toFixed(1)} / ${device.stats.storageTotalGb.toFixed(1)} GB`}
                color="emerald"
                progress={device.stats.storagePercent}
                isOnline={isOnline}
              />
            </div>

            {/* Power & Network Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Power Card */}
              <Card variant="glass" className="border-slate-200 dark:border-white/5">
                <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 pb-3">
                  <CardTitle icon={<Zap className="w-5 h-5 text-yellow-400" />}>
                    Power
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-300 dark:border-slate-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-4 h-4 text-yellow-400" />
                        <span className="text-xs text-slate-600 dark:text-slate-400">Consumption</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">
                        {device.stats.powerConsumptionWatts !== null 
                          ? `${device.stats.powerConsumptionWatts.toFixed(1)}W` 
                          : 'N/A'}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-300 dark:border-slate-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Battery className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs text-slate-600 dark:text-slate-400">Source</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900 dark:text-white capitalize">
                        {device.stats.powerSource}
                      </p>
                    </div>
                  </div>
                  {device.stats.batteryPercent !== null && (
                    <div className="p-3 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-300 dark:border-slate-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Battery Level</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{device.stats.batteryPercent}%</span>
                      </div>
                      <div className="w-full bg-slate-300 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${
                            device.stats.batteryPercent > 50 ? 'bg-emerald-500' :
                            device.stats.batteryPercent > 20 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${device.stats.batteryPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Network Card */}
              <Card variant="glass" className="border-slate-200 dark:border-white/5">
                <CardHeader className="border-b border-slate-200 dark:border-slate-800/50 pb-3">
                  <CardTitle icon={<Wifi className="w-5 h-5 text-cyan-400" />}>
                    Network
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-300 dark:border-slate-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs text-slate-600 dark:text-slate-400">Latency</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">
                        {device.stats.networkLatencyMs !== null 
                          ? `${device.stats.networkLatencyMs}ms` 
                          : 'N/A'}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-300 dark:border-slate-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        <span className="text-xs text-slate-600 dark:text-slate-400">Last Heartbeat</span>
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {formatDistanceToNow(new Date(device.stats.lastHeartbeat), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-300 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-600 dark:text-slate-400">Connection Status</span>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                        <span className={`text-sm font-medium ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isOnline ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detection Stats */}
            <Card variant="glass" className="border-slate-200 dark:border-white/5">
              <CardHeader className="border-b border-slate-200 dark:border-slate-800/50">
                <CardTitle 
                  icon={<Activity className="w-5 h-5 text-primary-400" />}
                  badge={
                    <Badge variant="success" size="sm">
                      {device.stats.detectionCount} Total
                    </Badge>
                  }
                >
                  Detection Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-32 flex items-center justify-center">
                  {telemetryHistory.length > 0 ? (
                    <div className="w-full h-full flex items-end gap-1">
                      {telemetryHistory.slice(-30).map((t, i) => (
                        <div 
                          key={i}
                          className="flex-1 bg-primary-500/30 hover:bg-primary-500/50 transition-colors rounded-t"
                          style={{ 
                            height: `${Math.max(10, t.cpu)}%`,
                            animationDelay: `${i * 50}ms`
                          }}
                          title={`CPU: ${t.cpu}%`}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 dark:text-slate-500 text-sm">No telemetry data available</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Last Seen Info */}
            <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-900/30 rounded-lg border border-slate-300 dark:border-slate-800/50">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Last Seen</p>
                  <p className="text-slate-900 dark:text-white font-medium">
                    {format(new Date(device.lastSeen), 'PPpp')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {formatDistanceToNow(new Date(device.lastSeen), { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: string
  subValue?: string
  color: 'blue' | 'violet' | 'amber' | 'emerald' | 'red'
  progress?: number
  isOnline: boolean
  warning?: boolean
}

function MetricCard({ icon, label, value, subValue, color, progress, isOnline, warning }: MetricCardProps) {
  const colorClasses = {
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', bar: 'bg-blue-500' },
    violet: { bg: 'bg-violet-500/10', text: 'text-violet-400', bar: 'bg-violet-500' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', bar: 'bg-amber-500' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', bar: 'bg-emerald-500' },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', bar: 'bg-red-500' }
  }

  const colors = warning ? colorClasses.red : colorClasses[color]

  return (
    <div className={`p-4 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/50 transition-all duration-300 ${
      isOnline ? 'hover:border-slate-400 dark:hover:border-slate-700' : 'opacity-60'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg ${colors.bg}`}>
          <span className={colors.text}>{icon}</span>
        </div>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      </div>
      <div className="space-y-2">
        <p className={`text-2xl font-bold ${isOnline ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
          {isOnline ? value : '--'}
        </p>
        {subValue && isOnline && (
          <p className="text-xs text-slate-500 dark:text-slate-500">{subValue}</p>
        )}
        {progress !== undefined && isOnline && (
          <div className="w-full bg-slate-300 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ${colors.bar}`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
