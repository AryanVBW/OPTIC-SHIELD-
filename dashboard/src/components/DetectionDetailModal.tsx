'use client'

import { useEffect, useCallback } from 'react'
import { X, MapPin, Camera, Clock, Zap, AlertTriangle, Copy, Check, ExternalLink, Calendar, CircuitBoard, Info, ImageIcon, Target } from 'lucide-react'
import { Detection } from '@/types'
import { format, formatDistanceToNow } from 'date-fns'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { useState } from 'react'

interface DetectionDetailModalProps {
    detection: Detection | null
    onClose: () => void
}

const wildCatEmojis: Record<string, string> = {
    tiger: '🐯',
    lion: '🦁',
    leopard: '🐆',
    jaguar: '🐆',
    cheetah: '🐆',
    'snow leopard': '🐆',
    'clouded leopard': '🐆',
    puma: '🐆',
    lynx: '🐈',
    default: '🐯'
}

const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'success'
    if (confidence >= 0.7) return 'info'
    if (confidence >= 0.5) return 'warning'
    return 'default'
}

const getConfidenceGradient = (confidence: number) => {
    if (confidence >= 0.9) return 'from-emerald-500 to-emerald-600'
    if (confidence >= 0.7) return 'from-blue-500 to-blue-600'
    if (confidence >= 0.5) return 'from-amber-500 to-amber-600'
    return 'from-slate-500 to-slate-600'
}

export function DetectionDetailModal({ detection, onClose }: DetectionDetailModalProps) {
    const [copiedId, setCopiedId] = useState(false)
    const [activeTab, setActiveTab] = useState<'overview' | 'technical'>('overview')

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
    }, [onClose])

    useEffect(() => {
        if (detection) {
            document.addEventListener('keydown', handleKeyDown)
            document.body.style.overflow = 'hidden'
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.body.style.overflow = ''
        }
    }, [detection, handleKeyDown])

    if (!detection) return null

    const copyEventId = () => {
        if (detection.eventId) {
            navigator.clipboard.writeText(detection.eventId)
            setCopiedId(true)
            setTimeout(() => setCopiedId(false), 2000)
        }
    }

    const emoji = wildCatEmojis[detection.className.toLowerCase()] || wildCatEmojis.default

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-4xl max-h-[90vh] flex flex-col glass-panel spotlight-card rounded-3xl shadow-2xl shadow-black/50 overflow-hidden animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Local Noise Texture */}
                <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.03]" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }} />

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-slate-700/50 bg-surface/50 dark:bg-slate-900/50 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-14 h-14 flex items-center justify-center bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 rounded-2xl border border-emerald-500/20">
                                <span className="text-3xl">{emoji}</span>
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-foreground capitalize tracking-tight">
                                {detection.className}
                            </h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm text-slate-500 dark:text-slate-400">{detection.deviceName}</span>
                                {detection.metadata?.priority === 'high' && (
                                    <Badge variant="error" size="sm" className="animate-pulse">
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                        High Priority
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200 group"
                    >
                        <X className="w-5 h-5 text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Image Section */}
                    <div className="relative bg-black">
                        <div className="aspect-video max-h-96 w-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950">
                            {detection.imageUrl ? (
                                <img
                                    src={detection.imageUrl}
                                    alt={`${detection.className} detection`}
                                    className="max-w-full max-h-full object-contain"
                                />
                            ) : (
                                <div className="text-center text-slate-600">
                                    <ImageIcon className="w-20 h-20 mx-auto mb-3 opacity-20" />
                                    <p className="text-lg font-medium">No image captured</p>
                                    <p className="text-sm opacity-50 mt-1">Detection was recorded without an image</p>
                                </div>
                            )}
                        </div>

                        {/* Image Overlay Info */}
                        {detection.bbox && detection.bbox.length === 4 && (
                            <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-500/90 backdrop-blur-sm rounded-lg text-xs text-white font-medium">
                                <Target className="w-3.5 h-3.5" />
                                Detection area marked
                            </div>
                        )}

                        {/* Confidence Badge on Image */}
                        <div className="absolute top-4 right-4">
                            <div className="relative px-4 py-2 bg-black/60 backdrop-blur-md rounded-xl border border-white/10">
                                <div className="text-xs text-slate-400 mb-1">Confidence</div>
                                <div className={`text-2xl font-bold bg-gradient-to-r ${getConfidenceGradient(detection.confidence)} bg-clip-text text-transparent`}>
                                    {(detection.confidence * 100).toFixed(1)}%
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="sticky top-0 z-20 flex gap-1 px-6 py-3 bg-surface/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-border dark:border-slate-700/50">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'overview'
                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                                    : 'text-slate-500 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                        >
                            <Info className="w-4 h-4 inline mr-2" />
                            Overview
                        </button>
                        <button
                            onClick={() => setActiveTab('technical')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'technical'
                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                                    : 'text-slate-500 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                        >
                            <CircuitBoard className="w-4 h-4 inline mr-2" />
                            Technical Details
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="p-6 space-y-6">
                        {activeTab === 'overview' && (
                            <>
                                {/* Quick Stats Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="p-4 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                                            <Zap className="w-3.5 h-3.5 text-emerald-500" />
                                            Confidence
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-2xl font-bold text-foreground">{(detection.confidence * 100).toFixed(1)}</span>
                                            <span className="text-sm text-slate-500">%</span>
                                        </div>
                                        <div className="mt-2 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full bg-gradient-to-r ${getConfidenceGradient(detection.confidence)} rounded-full transition-all duration-500`}
                                                style={{ width: `${detection.confidence * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                                            <Clock className="w-3.5 h-3.5 text-blue-500" />
                                            Detected
                                        </div>
                                        <div className="text-xl font-bold text-foreground">
                                            {format(new Date(detection.timestamp), 'HH:mm:ss')}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            {formatDistanceToNow(new Date(detection.timestamp), { addSuffix: true })}
                                        </div>
                                    </div>

                                    <div className="p-4 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                                            <Calendar className="w-3.5 h-3.5 text-purple-500" />
                                            Date
                                        </div>
                                        <div className="text-xl font-bold text-foreground">
                                            {format(new Date(detection.timestamp), 'MMM d')}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            {format(new Date(detection.timestamp), 'yyyy')}
                                        </div>
                                    </div>

                                    <div className="p-4 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                            Priority
                                        </div>
                                        <div className="text-xl font-bold text-foreground capitalize">
                                            {detection.metadata?.priority || 'Normal'}
                                        </div>
                                        <Badge
                                            variant={detection.metadata?.priority === 'high' ? 'error' : 'default'}
                                            size="sm"
                                            className="mt-1"
                                        >
                                            {detection.metadata?.priority === 'high' ? 'Urgent' : 'Standard'}
                                        </Badge>
                                    </div>
                                </div>

                                {/* Device & Location Info */}
                                <div className="grid md:grid-cols-2 gap-4">
                                    {/* Device Info */}
                                    <div className="p-5 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                                        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                                            <Camera className="w-4 h-4 text-blue-500" />
                                            Device Information
                                        </h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center py-2 border-b border-slate-200/50 dark:border-slate-700/50">
                                                <span className="text-sm text-slate-500 dark:text-slate-400">Device Name</span>
                                                <span className="text-sm font-medium text-foreground">{detection.deviceName}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-2 border-b border-slate-200/50 dark:border-slate-700/50">
                                                <span className="text-sm text-slate-500 dark:text-slate-400">Device ID</span>
                                                <code className="text-xs font-mono bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">{detection.deviceId}</code>
                                            </div>
                                            {detection.cameraId && (
                                                <div className="flex justify-between items-center py-2">
                                                    <span className="text-sm text-slate-500 dark:text-slate-400">Camera ID</span>
                                                    <code className="text-xs font-mono bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">{detection.cameraId}</code>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Location Info */}
                                    <div className="p-5 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                                        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-red-500" />
                                            Location
                                        </h3>
                                        {detection.location ? (
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center py-2 border-b border-slate-200/50 dark:border-slate-700/50">
                                                    <span className="text-sm text-slate-500 dark:text-slate-400">Name</span>
                                                    <span className="text-sm font-medium text-foreground">{detection.location.name}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-2 border-b border-slate-200/50 dark:border-slate-700/50">
                                                    <span className="text-sm text-slate-500 dark:text-slate-400">Latitude</span>
                                                    <code className="text-xs font-mono bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">
                                                        {detection.location.latitude.toFixed(6)}°
                                                    </code>
                                                </div>
                                                <div className="flex justify-between items-center py-2">
                                                    <span className="text-sm text-slate-500 dark:text-slate-400">Longitude</span>
                                                    <code className="text-xs font-mono bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">
                                                        {detection.location.longitude.toFixed(6)}°
                                                    </code>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full mt-2"
                                                    onClick={() => window.open(`https://maps.google.com/?q=${detection.location!.latitude},${detection.location!.longitude}`, '_blank')}
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5 mr-2" />
                                                    View on Google Maps
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="text-center py-6 text-slate-500 dark:text-slate-400">
                                                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                                <p className="text-sm">No location data available</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'technical' && (
                            <>
                                {/* Technical Stats */}
                                <div className="grid md:grid-cols-3 gap-4">
                                    {detection.metadata?.processingTimeMs && (
                                        <div className="p-4 bg-gradient-to-br from-yellow-100 to-yellow-50 dark:from-yellow-900/20 dark:to-yellow-900/10 rounded-xl border border-yellow-200/50 dark:border-yellow-700/30">
                                            <div className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-400 mb-2">
                                                <Zap className="w-3.5 h-3.5" />
                                                Processing Time
                                            </div>
                                            <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                                                {detection.metadata.processingTimeMs.toFixed(0)}
                                                <span className="text-sm ml-1">ms</span>
                                            </div>
                                        </div>
                                    )}

                                    {detection.metadata?.frameTimestamp && (
                                        <div className="p-4 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                                                <Clock className="w-3.5 h-3.5" />
                                                Frame Timestamp
                                            </div>
                                            <div className="text-lg font-mono font-bold text-foreground">
                                                {detection.metadata.frameTimestamp}
                                            </div>
                                        </div>
                                    )}

                                    <div className="p-4 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                                            <Target className="w-3.5 h-3.5" />
                                            Detection ID
                                        </div>
                                        <div className="text-lg font-mono font-bold text-foreground">
                                            #{detection.id}
                                        </div>
                                    </div>
                                </div>

                                {/* Bounding Box Coordinates */}
                                {detection.bbox && detection.bbox.length === 4 && (
                                    <div className="p-5 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                                        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                                            <Target className="w-4 h-4 text-red-500" />
                                            Bounding Box Coordinates
                                        </h3>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {['X Min', 'Y Min', 'X Max', 'Y Max'].map((label, idx) => (
                                                <div key={label} className="text-center p-3 bg-slate-200/50 dark:bg-slate-700/50 rounded-lg">
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</div>
                                                    <div className="text-lg font-mono font-bold text-foreground">
                                                        {detection.bbox[idx].toFixed(2)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Event ID */}
                                {detection.eventId && (
                                    <div className="p-5 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                                        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                            <Info className="w-4 h-4 text-blue-500" />
                                            Event Identifier
                                        </h3>
                                        <div className="flex items-center gap-3">
                                            <code className="flex-1 text-sm font-mono bg-slate-200 dark:bg-slate-700 px-4 py-3 rounded-lg overflow-x-auto">
                                                {detection.eventId}
                                            </code>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={copyEventId}
                                                className="flex-shrink-0"
                                            >
                                                {copiedId ? (
                                                    <>
                                                        <Check className="w-4 h-4 mr-1 text-emerald-500" />
                                                        Copied
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy className="w-4 h-4 mr-1" />
                                                        Copy
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Raw Metadata */}
                                {detection.metadata?.deviceInfo && Object.keys(detection.metadata.deviceInfo).length > 0 && (
                                    <div className="p-5 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                                        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                            <CircuitBoard className="w-4 h-4 text-purple-500" />
                                            Additional Device Info
                                        </h3>
                                        <pre className="text-xs font-mono bg-slate-200 dark:bg-slate-700 p-4 rounded-lg overflow-x-auto">
                                            {JSON.stringify(detection.metadata.deviceInfo, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border dark:border-slate-700/50 bg-surface/50 dark:bg-slate-900/50 backdrop-blur-sm flex justify-between items-center">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        Full timestamp: {format(new Date(detection.timestamp), 'EEEE, MMMM d, yyyy \'at\' HH:mm:ss zzz')}
                    </div>
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    )
}
