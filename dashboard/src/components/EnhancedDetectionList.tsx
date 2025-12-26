'use client'

import { useState } from 'react'
import { AlertCircle, Filter, Search, Calendar, ChevronRight } from 'lucide-react'
import { Detection } from '@/types'
import { format } from 'date-fns'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

interface EnhancedDetectionListProps {
  detections: Detection[]
}

const animalEmojis: Record<string, string> = {
  bird: '🐦',
  cat: '🐱',
  dog: '🐕',
  horse: '🐴',
  sheep: '🐑',
  cow: '🐄',
  elephant: '🐘',
  bear: '🐻',
  zebra: '🦓',
  giraffe: '🦒',
  default: '🦁'
}

export function EnhancedDetectionList({ detections }: EnhancedDetectionListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClass, setSelectedClass] = useState<string | null>(null)

  const filteredDetections = detections.filter(detection => {
    const matchesSearch = detection.className.toLowerCase().includes(searchTerm.toLowerCase()) ||
      detection.deviceName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesClass = !selectedClass || detection.className === selectedClass
    return matchesSearch && matchesClass
  })

  const uniqueClasses = Array.from(new Set(detections.map(d => d.className)))

  if (detections.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border-dashed border-slate-800">
        <div className="relative group">
          <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          <AlertCircle className="w-16 h-16 text-slate-600 mb-4 relative z-10" />
        </div>
        <p className="text-xl font-semibold text-slate-300 mb-2">No detections yet</p>
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
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-400 transition-colors" />
          <input
            type="text"
            placeholder="Search by animal or device..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:bg-slate-900/80 focus:ring-1 focus:ring-emerald-500/20 transition-all shadow-sm"
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
            className="group relative flex items-center gap-5 p-4 bg-gradient-to-r from-slate-900/60 to-slate-900/40 rounded-xl border border-slate-700/50 hover:bg-slate-800/60 hover:border-emerald-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-900/5 overflow-hidden"
          >
            {/* Hover Glint */}
            <div className="absolute top-0 left-0 w-[200%] h-full bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none" />

            <div className="relative flex-shrink-0 w-12 h-12 flex items-center justify-center bg-slate-800/50 rounded-xl border border-slate-700/50 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/10 transition-colors">
              <span className="text-2xl transform group-hover:scale-110 transition-transform duration-300">
                {animalEmojis[detection.className.toLowerCase()] || animalEmojis.default}
              </span>
            </div>

            <div className="flex-1 min-w-0 z-10">
              <div className="flex items-center gap-3 mb-1">
                <span className="font-bold text-white capitalize text-lg tracking-tight group-hover:text-emerald-400 transition-colors">
                  {detection.className}
                </span>
                <Badge
                  variant={getConfidenceColor(detection.confidence)}
                  size="sm"
                  className="bg-opacity-20 border-opacity-20 backdrop-blur-sm"
                >
                  {(detection.confidence * 100).toFixed(0)}%
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-emerald-500 transition-colors" />
                  <span className="truncate max-w-[150px]">{detection.deviceName}</span>
                </div>
                <div className="hidden sm:flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{format(new Date(detection.timestamp), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>

            <div className="text-right flex-shrink-0 z-10 pl-4 border-l border-slate-800/50">
              <div className="text-sm font-bold text-white font-mono group-hover:text-emerald-300 transition-colors">
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
    </div>
  )
}
