'use client'

import { useEffect, useCallback } from 'react'
import { X, MapPin, Camera, Clock, Zap, AlertTriangle, Copy, Check, ExternalLink, Calendar, CircuitBoard, Info, ImageIcon, Target, ArrowLeft } from 'lucide-react'
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
        <div className="fixed inset-0 z-50 bg-slate-950 animate-in fade-in duration-200">
            {/* Full Page Container */}
            <div className="w-full h-full flex flex-col lg:flex-row">

                {/* Left Panel - Image Section (Full Height on Desktop) */}
                <div className="relative w-full lg:w-1/2 h-[40vh] lg:h-full bg-black flex items-center justify-center">
                    {/* Back Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-6 left-6 z-20 flex items-center gap-2 px-4 py-2.5 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-xl border border-white/10 text-white transition-all duration-200 group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                        <span className="font-medium">Back</span>
                    </button>

                    {/* Animal Name Badge */}
                    <div className="absolute top-6 right-6 z-20">
                        <div className="flex items-center gap-3 px-5 py-3 bg-black/60 backdrop-blur-md rounded-xl border border-white/10">
                            <span className="text-4xl">{emoji}</span>
                            <div>
                                <h1 className="text-2xl font-bold text-white capitalize">{detection.className}</h1>
                                <p className="text-sm text-slate-400">{detection.deviceName}</p>
                            </div>
                        </div>
                    </div>

                    {/* Main Image */}
                    {detection.imageUrl ? (
                        <img
                            src={detection.imageUrl}
                            alt={`${detection.className} detection`}
                            className="w-full h-full object-contain"
                        />
                    ) : (
                        <div className="text-center text-slate-600">
                            <ImageIcon className="w-32 h-32 mx-auto mb-6 opacity-20" />
                            <p className="text-2xl font-medium">No image captured</p>
                            <p className="text-base opacity-50 mt-2">Detection was recorded without an image</p>
                        </div>
                    )}

                    {/* Confidence Badge */}
                    <div className="absolute bottom-6 right-6 z-20">
                        <div className="px-6 py-4 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 text-center">
                            <div className="text-xs text-slate-400 mb-1">AI Confidence</div>
                            <div className={`text-4xl font-bold bg-gradient-to-r ${getConfidenceGradient(detection.confidence)} bg-clip-text text-transparent`}>
                                {(detection.confidence * 100).toFixed(1)}%
                            </div>
                        </div>
                    </div>

                    {/* Detection Box Indicator */}
                    {detection.bbox && detection.bbox.length === 4 && (
                        <div className="absolute bottom-6 left-6 z-20 flex items-center gap-2 px-4 py-2.5 bg-red-500/90 backdrop-blur-sm rounded-xl text-sm text-white font-medium">
                            <Target className="w-4 h-4" />
                            Detection area marked
                        </div>
                    )}

                    {/* Priority Alert */}
                    {detection.metadata?.priority === 'high' && (
                        <div className="absolute top-20 left-6 z-20 flex items-center gap-2 px-4 py-2.5 bg-red-600/90 backdrop-blur-sm rounded-xl text-sm text-white font-medium animate-pulse">
                            <AlertTriangle className="w-4 h-4" />
                            High Priority Alert
                        </div>
                    )}
                </div>

                {/* Right Panel - Details Section */}
                <div className="w-full lg:w-1/2 h-[60vh] lg:h-full bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 flex flex-col overflow-hidden">

                    {/* Header with Tabs */}
                    <div className="flex-shrink-0 px-8 py-6 border-b border-slate-800/50">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-white">Detection Details</h2>
                            <button
                                onClick={onClose}
                                className="lg:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        {/* Tab Navigation */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setActiveTab('overview')}
                                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'overview'
                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                    }`}
                            >
                                <Info className="w-4 h-4 inline mr-2" />
                                Overview
                            </button>
                            <button
                                onClick={() => setActiveTab('technical')}
                                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'technical'
                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                    }`}
                            >
                                <CircuitBoard className="w-4 h-4 inline mr-2" />
                                Technical
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-6">
                        {activeTab === 'overview' && (
                            <>
                                {/* Quick Stats */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                                            <Zap className="w-4 h-4 text-emerald-500" />
                                            Confidence Score
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-3xl font-bold text-white">{(detection.confidence * 100).toFixed(1)}</span>
                                            <span className="text-lg text-slate-500">%</span>
                                        </div>
                                        <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full bg-gradient-to-r ${getConfidenceGradient(detection.confidence)} rounded-full`}
                                                style={{ width: `${detection.confidence * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                                            Priority Level
                                        </div>
                                        <div className="text-3xl font-bold text-white capitalize">
                                            {detection.metadata?.priority || 'Normal'}
                                        </div>
                                        <Badge
                                            variant={detection.metadata?.priority === 'high' ? 'error' : 'default'}
                                            size="sm"
                                            className="mt-2"
                                        >
                                            {detection.metadata?.priority === 'high' ? 'Urgent Response' : 'Standard'}
                                        </Badge>
                                    </div>
                                </div>

                                {/* Timestamp Info */}
                                <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
                                        <Clock className="w-4 h-4 text-blue-500" />
                                        Detection Timestamp
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Date</div>
                                            <div className="text-xl font-bold text-white">
                                                {format(new Date(detection.timestamp), 'MMMM d, yyyy')}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-500 mb-1">Time</div>
                                            <div className="text-xl font-bold text-white">
                                                {format(new Date(detection.timestamp), 'HH:mm:ss')}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-3 text-sm text-emerald-400">
                                        {formatDistanceToNow(new Date(detection.timestamp), { addSuffix: true })}
                                    </div>
                                </div>

                                {/* Device Info */}
                                <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                        <Camera className="w-4 h-4 text-blue-500" />
                                        Device Information
                                    </h3>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
                                            <span className="text-sm text-slate-400">Device Name</span>
                                            <span className="text-sm font-medium text-white">{detection.deviceName}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
                                            <span className="text-sm text-slate-400">Device ID</span>
                                            <code className="text-xs font-mono bg-slate-700 px-2 py-1 rounded text-slate-300">{detection.deviceId}</code>
                                        </div>
                                        {detection.cameraId && (
                                            <div className="flex justify-between items-center py-2">
                                                <span className="text-sm text-slate-400">Camera ID</span>
                                                <code className="text-xs font-mono bg-slate-700 px-2 py-1 rounded text-slate-300">{detection.cameraId}</code>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Location Info */}
                                <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-red-500" />
                                        Location Data
                                    </h3>
                                    {detection.location ? (
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
                                                <span className="text-sm text-slate-400">Location Name</span>
                                                <span className="text-sm font-medium text-white">{detection.location.name}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
                                                <span className="text-sm text-slate-400">Latitude</span>
                                                <code className="text-xs font-mono bg-slate-700 px-2 py-1 rounded text-slate-300">
                                                    {detection.location.latitude.toFixed(6)}°
                                                </code>
                                            </div>
                                            <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
                                                <span className="text-sm text-slate-400">Longitude</span>
                                                <code className="text-xs font-mono bg-slate-700 px-2 py-1 rounded text-slate-300">
                                                    {detection.location.longitude.toFixed(6)}°
                                                </code>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full mt-2"
                                                onClick={() => window.open(`https://maps.google.com/?q=${detection.location!.latitude},${detection.location!.longitude}`, '_blank')}
                                            >
                                                <ExternalLink className="w-4 h-4 mr-2" />
                                                Open in Google Maps
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-slate-500">
                                            <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                            <p className="text-sm">No location data available</p>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {activeTab === 'technical' && (
                            <>
                                {/* Technical Stats */}
                                <div className="grid grid-cols-2 gap-4">
                                    {detection.metadata?.processingTimeMs && (
                                        <div className="p-5 bg-yellow-900/20 rounded-xl border border-yellow-700/30">
                                            <div className="flex items-center gap-2 text-xs text-yellow-400 mb-2">
                                                <Zap className="w-4 h-4" />
                                                Processing Time
                                            </div>
                                            <div className="text-3xl font-bold text-yellow-400">
                                                {detection.metadata.processingTimeMs.toFixed(0)}
                                                <span className="text-lg ml-1">ms</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                                            <Target className="w-4 h-4" />
                                            Detection ID
                                        </div>
                                        <div className="text-2xl font-mono font-bold text-white">
                                            #{detection.id}
                                        </div>
                                    </div>
                                </div>

                                {detection.metadata?.frameTimestamp && (
                                    <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                                            <Clock className="w-4 h-4" />
                                            Frame Timestamp
                                        </div>
                                        <div className="text-xl font-mono font-bold text-white">
                                            {detection.metadata.frameTimestamp}
                                        </div>
                                    </div>
                                )}

                                {/* Bounding Box */}
                                {detection.bbox && detection.bbox.length === 4 && (
                                    <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                                            <Target className="w-4 h-4 text-red-500" />
                                            Bounding Box Coordinates
                                        </h3>
                                        <div className="grid grid-cols-4 gap-3">
                                            {['X Min', 'Y Min', 'X Max', 'Y Max'].map((label, idx) => (
                                                <div key={label} className="text-center p-3 bg-slate-700/50 rounded-lg">
                                                    <div className="text-xs text-slate-400 mb-1">{label}</div>
                                                    <div className="text-lg font-mono font-bold text-white">
                                                        {detection.bbox[idx].toFixed(2)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Event ID */}
                                {detection.eventId && (
                                    <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                                            <Info className="w-4 h-4 text-blue-500" />
                                            Event Identifier
                                        </h3>
                                        <div className="flex items-center gap-3">
                                            <code className="flex-1 text-sm font-mono bg-slate-700 px-4 py-3 rounded-lg text-slate-300 overflow-x-auto">
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
                                    <div className="p-5 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                                            <CircuitBoard className="w-4 h-4 text-purple-500" />
                                            Additional Device Info
                                        </h3>
                                        <pre className="text-xs font-mono bg-slate-700 p-4 rounded-lg overflow-x-auto text-slate-300">
                                            {JSON.stringify(detection.metadata.deviceInfo, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex-shrink-0 px-8 py-4 border-t border-slate-800/50 bg-slate-900/50">
                        <div className="flex justify-between items-center">
                            <div className="text-xs text-slate-500">
                                {format(new Date(detection.timestamp), 'EEEE, MMMM d, yyyy \'at\' HH:mm:ss')}
                            </div>
                            <Button variant="primary" onClick={onClose}>
                                Close Details
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
