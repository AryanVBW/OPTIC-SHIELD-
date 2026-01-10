'use client';

import React, { useState, useEffect } from 'react';

interface CrashReport {
    crash_id: string;
    timestamp: string;
    device_id: string;
    service_name: string;
    exception: {
        type: string;
        message: string;
        stack_trace: string;
    };
    context: Record<string, any>;
    system_state: {
        cpu_percent: number;
        memory_percent: number;
        disk_usage: number;
        process_count: number;
    };
    thread_info: {
        count: number;
        threads: Array<{
            name: string;
            daemon: boolean;
            alive: boolean;
        }>;
    };
}

interface CrashLogViewerProps {
    deviceId: string;
}

export default function CrashLogViewer({ deviceId }: CrashLogViewerProps) {
    const [crashes, setCrashes] = useState<CrashReport[]>([]);
    const [selectedCrash, setSelectedCrash] = useState<CrashReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterService, setFilterService] = useState<string>('all');

    useEffect(() => {
        const fetchCrashes = async () => {
            try {
                const response = await fetch(`/api/devices/${deviceId}/crashes`);
                if (!response.ok) throw new Error('Failed to fetch crash logs');
                const data = await response.json();
                setCrashes(data.crashes || []);
                setLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
                setLoading(false);
            }
        };

        fetchCrashes();
        const interval = setInterval(fetchCrashes, 30000); // Refresh every 30 seconds

        return () => clearInterval(interval);
    }, [deviceId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">Error loading crash logs: {error}</p>
            </div>
        );
    }

    const services = ['all', ...Array.from(new Set(crashes.map(c => c.service_name)))];
    const filteredCrashes = filterService === 'all'
        ? crashes
        : crashes.filter(c => c.service_name === filterService);

    const formatTimestamp = (timestamp: string) => {
        return new Date(timestamp).toLocaleString();
    };

    const getSeverityColor = (serviceName: string) => {
        if (serviceName === 'main') return 'bg-red-100 text-red-800 border-red-300';
        if (serviceName === 'detection') return 'bg-orange-100 text-orange-800 border-orange-300';
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold">Crash Logs</h2>
                        <p className="text-gray-600 mt-1">
                            Total crashes: {crashes.length}
                            {filterService !== 'all' && ` (${filteredCrashes.length} filtered)`}
                        </p>
                    </div>

                    {/* Filter */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Filter by service:</label>
                        <select
                            value={filterService}
                            onChange={(e) => setFilterService(e.target.value)}
                            className="border border-gray-300 rounded px-3 py-2 text-sm"
                        >
                            {services.map(service => (
                                <option key={service} value={service}>
                                    {service === 'all' ? 'All Services' : service}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Summary Stats */}
                {crashes.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                        <div className="bg-gray-50 rounded p-4">
                            <p className="text-sm text-gray-500">Last 24h</p>
                            <p className="text-2xl font-bold">
                                {crashes.filter(c =>
                                    new Date(c.timestamp) > new Date(Date.now() - 86400000)
                                ).length}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded p-4">
                            <p className="text-sm text-gray-500">Most Recent</p>
                            <p className="text-sm font-semibold">
                                {formatTimestamp(crashes[0]?.timestamp || '')}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded p-4">
                            <p className="text-sm text-gray-500">Top Service</p>
                            <p className="text-sm font-semibold">
                                {crashes[0]?.service_name || 'N/A'}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded p-4">
                            <p className="text-sm text-gray-500">Common Error</p>
                            <p className="text-sm font-semibold truncate">
                                {crashes[0]?.exception.type || 'N/A'}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Crash List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* List Panel */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="font-semibold">Crash Reports ({filteredCrashes.length})</h3>
                    </div>
                    <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                        {filteredCrashes.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                <p>No crashes found</p>
                                <p className="text-sm mt-2">System is running smoothly! 🎉</p>
                            </div>
                        ) : (
                            filteredCrashes.map((crash) => (
                                <div
                                    key={crash.crash_id}
                                    onClick={() => setSelectedCrash(crash)}
                                    className={`p-4 cursor-pointer hover:bg-gray-50 transition ${selectedCrash?.crash_id === crash.crash_id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                                        }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-xs px-2 py-1 rounded-full border ${getSeverityColor(crash.service_name)}`}>
                                                    {crash.service_name}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    {formatTimestamp(crash.timestamp)}
                                                </span>
                                            </div>
                                            <p className="font-semibold text-sm">{crash.exception.type}</p>
                                            <p className="text-sm text-gray-600 truncate">{crash.exception.message}</p>
                                        </div>
                                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Detail Panel */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="font-semibold">Crash Details</h3>
                    </div>
                    <div className="p-4 max-h-[600px] overflow-y-auto">
                        {!selectedCrash ? (
                            <div className="text-center text-gray-500 py-12">
                                <p>Select a crash report to view details</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Basic Info */}
                                <div>
                                    <h4 className="font-semibold mb-2">Basic Information</h4>
                                    <div className="bg-gray-50 rounded p-3 space-y-1 text-sm">
                                        <p><span className="text-gray-600">Crash ID:</span> <code className="text-xs bg-gray-200 px-1 py-0.5 rounded">{selectedCrash.crash_id}</code></p>
                                        <p><span className="text-gray-600">Service:</span> {selectedCrash.service_name}</p>
                                        <p><span className="text-gray-600">Time:</span> {formatTimestamp(selectedCrash.timestamp)}</p>
                                    </div>
                                </div>

                                {/* Exception */}
                                <div>
                                    <h4 className="font-semibold mb-2">Exception</h4>
                                    <div className="bg-red-50 border border-red-200 rounded p-3 space-y-2">
                                        <p className="font-semibold text-red-800">{selectedCrash.exception.type}</p>
                                        <p className="text-sm text-red-700">{selectedCrash.exception.message}</p>
                                    </div>
                                </div>

                                {/* Stack Trace */}
                                <div>
                                    <h4 className="font-semibold mb-2">Stack Trace</h4>
                                    <pre className="bg-gray-900 text-gray-100 rounded p-3 text-xs overflow-x-auto">
                                        {selectedCrash.exception.stack_trace}
                                    </pre>
                                </div>

                                {/* System State */}
                                <div>
                                    <h4 className="font-semibold mb-2">System State at Crash</h4>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div className="bg-gray-50 rounded p-2">
                                            <p className="text-gray-600 text-xs">CPU Usage</p>
                                            <p className="font-semibold">{selectedCrash.system_state.cpu_percent}%</p>
                                        </div>
                                        <div className="bg-gray-50 rounded p-2">
                                            <p className="text-gray-600 text-xs">Memory Usage</p>
                                            <p className="font-semibold">{selectedCrash.system_state.memory_percent}%</p>
                                        </div>
                                        <div className="bg-gray-50 rounded p-2">
                                            <p className="text-gray-600 text-xs">Disk Usage</p>
                                            <p className="font-semibold">{selectedCrash.system_state.disk_usage}%</p>
                                        </div>
                                        <div className="bg-gray-50 rounded p-2">
                                            <p className="text-gray-600 text-xs">Process Count</p>
                                            <p className="font-semibold">{selectedCrash.system_state.process_count}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Thread Info */}
                                <div>
                                    <h4 className="font-semibold mb-2">Active Threads ({selectedCrash.thread_info.count})</h4>
                                    <div className="bg-gray-50 rounded p-3 space-y-1 text-xs max-h-40 overflow-y-auto">
                                        {selectedCrash.thread_info.threads.map((thread, idx) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${thread.alive ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                                <span className="font-mono">{thread.name}</span>
                                                {thread.daemon && <span className="text-gray-500">(daemon)</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Context */}
                                {Object.keys(selectedCrash.context).length > 0 && (
                                    <div>
                                        <h4 className="font-semibold mb-2">Additional Context</h4>
                                        <pre className="bg-gray-50 rounded p-3 text-xs overflow-x-auto">
                                            {JSON.stringify(selectedCrash.context, null, 2)}
                                        </pre>
                                    </div>
                                )}

                                {/* Download Button */}
                                <button
                                    onClick={() => {
                                        const blob = new Blob([JSON.stringify(selectedCrash, null, 2)], { type: 'application/json' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `${selectedCrash.crash_id}.json`;
                                        a.click();
                                    }}
                                    className="w-full bg-gray-900 text-white py-2 px-4 rounded hover:bg-gray-800 transition"
                                >
                                    Download Full Report
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
