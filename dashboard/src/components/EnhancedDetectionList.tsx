'use client'

import { useState } from 'react'
import { AlertCircle, Filter, Search, Calendar, ChevronRight, MapPin, Image as ImageIcon } from 'lucide-react'
import { Detection } from '@/types'
import { format } from 'date-fns'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { DetectionDetailModal } from './DetectionDetailModal'

interface EnhancedDetectionListProps {
  detections: Detection[]
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

export function EnhancedDetectionList({ detections }: EnhancedDetectionListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null)

  const filteredDetections = detections.filter(detection => {
    const matchesSearch = detection.className.toLowerCase().includes(searchTerm.toLowerCase()) ||
      detection.deviceName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesClass = !selectedClass || detection.className === selectedClass
    return matchesSearch && matchesClass
  })

  const uniqueClasses = Array.from(new Set(detections.map(d => d.className)))

  if (detections.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-20 bg-surface/20 dark:bg-slate-900/20 border-dashed border-border dark:border-slate-800">
        <div className="relative group">
          <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          <AlertCircle className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4 relative z-10" />
        </div>
        <p className="text-xl font-semibold text-foreground mb-2">No detections yet</p>
        <p className="text-sm text-slate-500 max-w-sm text-center">
          Wildlife detections will appear here automatically when your devices capture activity.
        </p>
      </Card>
    )
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'success'
    if (confidence >= 0.7) return 'info'
    if (confidence >= 0.5) return 'warning'
    return 'default'
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
          <input
            type="text"
            placeholder="Search by animal or device..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-surface dark:bg-slate-900/50 border border-border dark:border-slate-700/50 rounded-xl text-foreground placeholder-slate-400 focus:outline-none focus:border-emerald-500/50 focus:bg-surface-highlight dark:focus:bg-slate-900/80 focus:ring-1 focus:ring-emerald-500/20 transition-all shadow-sm"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
          <Button
            variant={selectedClass === null ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSelectedClass(null)}
            className={`rounded-lg ${selectedClass === null ? 'shadow-lg shadow-emerald-500/20' : ''}`}
          >
            All
          </Button>
          {uniqueClasses.slice(0, 5).map(className => (
            <Button
              key={className}
              variant={selectedClass === className ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setSelectedClass(className)}
              className={`rounded-lg capitalize ${selectedClass === className ? 'shadow-lg shadow-emerald-500/20' : ''}`}
            >
              {className}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {filteredDetections.map((detection) => (
          <div
            key={`${detection.deviceId}-${detection.id}`}
            onClick={() => setSelectedDetection(detection)}
            className="group relative flex items-center gap-5 p-4 spotlight-card glass-panel rounded-xl cursor-pointer transition-all duration-300 hover:border-nexus-accent/30"
          >
            {/* Hover Glint */}
            <div className="absolute top-0 left-0 w-[200%] h-full bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none" />

            {/* Image Thumbnail */}
            {detection.imageUrl ? (
              <div className="relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-slate-700/50 group-hover:border-emerald-500/30 transition-colors">
                <img
                  src={detection.imageUrl}
                  alt={detection.className}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <ImageIcon className="absolute bottom-1 right-1 w-3 h-3 text-white/70" />
              </div>
            ) : (
              <div className="relative flex-shrink-0 w-14 h-14 flex items-center justify-center bg-slate-800/50 rounded-xl border border-slate-700/50 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/10 transition-colors">
                <span className="text-2xl transform group-hover:scale-110 transition-transform duration-300">
                  {wildCatEmojis[detection.className.toLowerCase()] || wildCatEmojis.default}
                </span>
              </div>
            )}

            <div className="flex-1 min-w-0 z-10">
              <div className="flex items-center gap-3 mb-1">
                <span className="font-bold text-foreground capitalize text-lg tracking-tight group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">
                  {detection.className}
                </span>
                <Badge
                  variant={getConfidenceColor(detection.confidence)}
                  size="sm"
                  className="bg-opacity-20 border-opacity-20 backdrop-blur-sm"
                >
                  {(detection.confidence * 100).toFixed(0)}%
                </Badge>
                {detection.metadata?.priority === 'high' && (
                  <Badge variant="error" size="sm" className="bg-red-500/20 border-red-500/30">
                    High Priority
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-emerald-500 transition-colors" />
                  <span className="truncate max-w-[150px]">{detection.deviceName}</span>
                </div>
                {detection.location && (
                  <div className="hidden md:flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[100px]">{detection.location.name}</span>
                  </div>
                )}
                <div className="hidden sm:flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{format(new Date(detection.timestamp), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>

            <div className="text-right flex-shrink-0 z-10 pl-4 border-l border-slate-200 dark:border-slate-800/50">
              <div className="text-sm font-bold text-foreground font-mono group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
                {format(new Date(detection.timestamp), 'HH:mm:ss')}
              </div>
              <div className="mt-1 flex justify-end">
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          </div>
        ))}

        {filteredDetections.length === 0 && detections.length > 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Filter className="w-10 h-10 mb-3 opacity-30" />
            <p className="font-medium">No detections match your filters</p>
            <Button
              variant="ghost"
              onClick={() => {
                setSearchTerm('')
                setSelectedClass(null)
              }}
              className="mt-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {/* Detection Detail Modal */}
      <DetectionDetailModal detection={selectedDetection} onClose={() => setSelectedDetection(null)} />
    </div>
  )
}
