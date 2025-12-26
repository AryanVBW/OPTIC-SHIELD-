'use client'

import { useState, useEffect } from 'react'
import { Shield, Camera, Activity, BarChart3, Settings, RefreshCw, Zap } from 'lucide-react'
import { Device, Detection, DashboardStats } from '@/types'
import { apiClient } from '@/lib/api-client'
import { EnhancedStatsOverview } from '@/components/EnhancedStatsOverview'
import { EnhancedDeviceCard } from '@/components/EnhancedDeviceCard'
import { EnhancedDetectionList } from '@/components/EnhancedDetectionList'
import { ActivityChart } from '@/components/ActivityChart'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Sidebar } from '@/components/layout/Sidebar'

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([])
  const [detections, setDetections] = useState<Detection[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  useEffect(() => {
    fetchDashboardData()
    const interval = setInterval(fetchDashboardData, 15000)
    return () => clearInterval(interval)
  }, [])

  const fetchDashboardData = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true)

    try {
      const [devicesData, detectionsData, statsData] = await Promise.all([
        apiClient.get<{ devices: Device[] }>('/api/devices'),
        apiClient.get<{ detections: Detection[] }>('/api/detections?limit=50'),
        apiClient.get<DashboardStats>('/api/stats')
      ])

      setDevices(devicesData.devices || [])
      setDetections(detectionsData.detections || [])
      setStats(statsData)
      setError(null)
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    fetchDashboardData(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl animate-pulse-slow animation-delay-500"></div>

        <div className="text-center relative z-10 p-8 glass-panel rounded-2xl border border-slate-800/50">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-primary-500/20 blur-xl rounded-full"></div>
            <Shield className="w-20 h-20 text-primary-500 mx-auto relative z-10" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-24 h-24 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">OPTIC-SHIELD</h2>
          <div className="flex items-center justify-center gap-2 text-slate-400">
            <LoadingSpinner label="Initializing System..." size="sm" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-slate-100 flex font-sans">
      <Sidebar onRefresh={handleRefresh} isRefreshing={refreshing} />

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative">
        {/* Background Ambient Glow */}
        <div className="fixed top-0 left-0 w-full h-[500px] bg-gradient-to-b from-primary-900/10 via-slate-900/5 to-transparent pointer-events-none" />

        <div className="max-w-[1600px] mx-auto px-6 py-10 space-y-10 relative z-10">

          {/* Header Area */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in-up">
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Mission Control</h1>
              <p className="text-slate-400 flex items-center gap-2">
                System Status: <span className="text-emerald-400 font-medium flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Operational</span>
              </p>
            </div>
            {lastUpdate && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/50 border border-slate-800 backdrop-blur-sm text-xs text-slate-400">
                <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                Last updated: {lastUpdate.toLocaleTimeString()}
              </div>
            )}
          </div>

          {error && (
            <Alert variant="error" title="Connection Error" onClose={() => setError(null)} className="animate-fade-in">
              {error}
            </Alert>
          )}

          <section className="animate-fade-in-up animation-delay-200">
            <EnhancedStatsOverview stats={stats} />
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-fade-in-up animation-delay-400">

            {/* Devices Column */}
            <div className="xl:col-span-1 space-y-8">
              <Card variant="glass" className="h-full border-white/5 shadow-xl shadow-black/20">
                <CardHeader className="border-b border-slate-800/50 pb-4">
                  <CardTitle
                    icon={<Camera className="w-5 h-5 text-accent-400" />}
                    badge={
                      <Badge variant="info" size="sm" className="bg-accent-500/10 text-accent-400 border-accent-500/20">
                        {devices.length} Active
                      </Badge>
                    }
                  >
                    Connected Devices
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 max-h-[800px] overflow-y-auto custom-scrollbar p-0 mt-4">
                  {devices.length === 0 ? (
                    <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-xl mx-4">
                      <Camera className="w-16 h-16 mx-auto mb-4 opacity-20" />
                      <p className="font-medium mb-1 text-slate-400">No devices online</p>
                      <p className="text-sm">Connect a device to start monitoring</p>
                    </div>
                  ) : (
                    <div className="px-4 pb-4 space-y-3">
                      {devices.map(device => (
                        <EnhancedDeviceCard key={device.id} device={device} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Main Data Column */}
            <div className="xl:col-span-2 space-y-8">

              {/* Activity Chart */}
              <Card variant="glass" className="border-white/5 shadow-xl shadow-black/20 overflow-hidden">
                <CardHeader className="border-b border-slate-800/50">
                  <CardTitle
                    icon={<BarChart3 className="w-5 h-5 text-primary-400" />}
                  >
                    Detection Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <ActivityChart stats={stats} />
                </CardContent>
              </Card>

              {/* Recent Detections */}
              <Card variant="glass" className="border-white/5 shadow-xl shadow-black/20">
                <CardHeader className="border-b border-slate-800/50">
                  <CardTitle
                    icon={<Zap className="w-5 h-5 text-warning-400" />}
                    badge={
                      <Badge variant="success" size="sm" className="bg-warning-500/10 text-warning-400 border-warning-500/20">
                        {detections.length} Recent
                      </Badge>
                    }
                  >
                    Live Detection Feed
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[500px] overflow-y-auto custom-scrollbar p-2">
                    <EnhancedDetectionList detections={detections} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
