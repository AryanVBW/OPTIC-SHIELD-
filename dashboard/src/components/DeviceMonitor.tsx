'use client';

import React, { useState, useEffect } from 'react';

interface HardwareMetrics {
    board: {
        model: string;
        revision: string;
        serial: string;
        memory_mb: number;
        manufacturer: string;
    };
    system: {
        os_name: string;
        hostname: string;
        uptime_seconds: number;
        python_version: string;
    };
    cpu: {
        temperature_celsius: number;
        frequency_current_mhz: number;
        usage_percent: number;
        usage_per_core: number[];
        core_count: number;
        throttled: boolean;
        throttled_status: Record<string, boolean>;
        load_average_1m: number;
    };
    gpu: {
        temperature_celsius: number;
        memory_mb: number;
        core_voltage: number;
    };
    memory: {
        total_mb: number;
        used_mb: number;
        available_mb: number;
        used_percent: number;
        swap_used_mb: number;
        swap_total_mb: number;
        swap_percent: number;
    };
    storage: {
        partitions: Array<{
            device: string;
            mountpoint: string;
            total_mb: number;
            used_mb: number;
            free_mb: number;
            percent: number;
        }>;
        io_stats: {
            read_count: number;
            write_count: number;
            read_bytes: number;
            write_bytes: number;
        };
    };
    network: {
        interfaces: Array<{
            name: string;
            addresses: Array<{ type: string; address: string }>;
            mac_address?: string;
            is_up: boolean;
            speed_mbps: number;
        }>;
        io_stats: {
            bytes_sent: number;
            bytes_recv: number;
            packets_sent: number;
            packets_recv: number;
        };
    };
    power: {
        core_voltage: number;
        undervoltage_detected: boolean;
        undervoltage_now: boolean;
    };
    thermal: {
        cpu_temperature: number;
        gpu_temperature: number;
        thermal_zones: Array<{ name: string; temperature: number }>;
    };
    camera: {
        detected: boolean;
        supported: boolean;
        cameras: Array<{ device: string; name: string }>;
    };
}

interface DeviceMonitorProps {
    deviceId: string;
}

export default function DeviceMonitor({ deviceId }: DeviceMonitorProps) {
    const [metrics, setMetrics] = useState<HardwareMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const response = await fetch(`/api/devices/${deviceId}/hardware`);
                if (!response.ok) throw new Error('Failed to fetch hardware metrics');
                const data = await response.json();
                setMetrics(data);
                setLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
                setLoading(false);
            }
        };

        fetchMetrics();
        const interval = setInterval(fetchMetrics, 5000); // Update every 5 seconds

        return () => clearInterval(interval);
    }, [deviceId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
            </div>
        );
    }

    if (error || !metrics) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">Error loading hardware metrics: {error}</p>
            </div>
        );
    }

    const formatUptime = (seconds: number) => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${mins}m`;
    };

    const formatBytes = (bytes: number) => {
        if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
        if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
        if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${bytes} B`;
    };

    const getHealthColor = (percent: number, inverted = false) => {
        const value = inverted ? 100 - percent : percent;
        if (value >= 80) return 'text-red-600';
        if (value >= 60) return 'text-yellow-600';
        return 'text-green-600';
    };

    const getTempColor = (temp: number) => {
        if (temp >= 80) return 'text-red-600';
        if (temp >= 70) return 'text-yellow-600';
        return 'text-green-600';
    };

    return (
        <div className="space-y-6">
            {/* System Overview */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-xl font-bold mb-4">System Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <p className="text-sm text-gray-500">Device Model</p>
                        <p className="text-lg font-semibold">{metrics.board.model}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Memory</p>
                        <p className="text-lg font-semibold">{metrics.board.memory_mb} MB</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Hostname</p>
                        <p className="text-lg font-semibold">{metrics.system.hostname}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Uptime</p>
                        <p className="text-lg font-semibold">{formatUptime(metrics.system.uptime_seconds)}</p>
                    </div>
                </div>
            </div>

            {/* CPU & Thermal */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-bold mb-4">CPU Metrics</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Temperature</span>
                            <span className={`font-bold ${getTempColor(metrics.cpu.temperature_celsius)}`}>
                                {metrics.cpu.temperature_celsius.toFixed(1)}°C
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Frequency</span>
                            <span className="font- semibold">{metrics.cpu.frequency_current_mhz.toFixed(0)} MHz</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Usage</span>
                            <span className={`font-bold ${getHealthColor(metrics.cpu.usage_percent)}`}>
                                {metrics.cpu.usage_percent.toFixed(1)}%
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Load Average (1m)</span>
                            <span className="font-semibold">{metrics.cpu.load_average_1m.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Cores</span>
                            <span className="font-semibold">{metrics.cpu.core_count}</span>
                        </div>
                        {metrics.cpu.throttled && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
                                <p className="text-yellow-800 text-sm font-semibold">⚠️ CPU Throttling Detected</p>
                                {metrics.cpu.throttled_status.under_voltage_now && (
                                    <p className="text-yellow-700 text-xs">• Undervoltage</p>
                                )}
                                {metrics.cpu.throttled_status.currently_throttled && (
                                    <p className="text-yellow-700 text-xs">• Currently throttled</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-bold mb-4">GPU & Power</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">GPU Temperature</span>
                            <span className={`font-bold ${getTempColor(metrics.gpu.temperature_celsius)}`}>
                                {metrics.gpu.temperature_celsius.toFixed(1)}°C
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">GPU Memory</span>
                            <span className="font-semibold">{metrics.gpu.memory_mb} MB</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Core Voltage</span>
                            <span className={`font-semibold ${metrics.power.undervoltage_now ? 'text-red-600' : 'text-green-600'}`}>
                                {metrics.power.core_voltage.toFixed(2)}V
                            </span>
                        </div>
                        {metrics.power.undervoltage_detected && (
                            <div className="bg-red-50 border border-red-200 rounded p-2 mt-2">
                                <p className="text-red-800 text-sm font-semibold">⚠️ Undervoltage Detected</p>
                                <p className="text-red-700 text-xs">Check power supply capacity</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Memory & Storage */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-bold mb-4">Memory</h3>
                    <div className="space-y-3">
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-gray-600">RAM Usage</span>
                                <span className={`font-bold ${getHealthColor(metrics.memory.used_percent)}`}>
                                    {metrics.memory.used_percent.toFixed(1)}%
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className={`h-2 rounded-full ${metrics.memory.used_percent > 80 ? 'bg-red-500' : metrics.memory.used_percent > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                    style={{ width: `${metrics.memory.used_percent}%` }}
                                ></div>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {metrics.memory.used_mb} MB / {metrics.memory.total_mb} MB
                            </p>
                        </div>

                        {metrics.memory.swap_total_mb > 0 && (
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-gray-600">Swap Usage</span>
                                    <span className={`font-bold ${getHealthColor(metrics.memory.swap_percent)}`}>
                                        {metrics.memory.swap_percent.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className={`h-2 rounded-full ${metrics.memory.swap_percent > 80 ? 'bg-red-500' : metrics.memory.swap_percent > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                        style={{ width: `${metrics.memory.swap_percent}%` }}
                                    ></div>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    {metrics.memory.swap_used_mb} MB / {metrics.memory.swap_total_mb} MB
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-bold mb-4">Storage</h3>
                    {metrics.storage.partitions.map((partition, idx) => (
                        <div key={idx} className="mb-4">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-gray-600">{partition.mountpoint}</span>
                                <span className={`font-bold ${getHealthColor(partition.percent)}`}>
                                    {partition.percent.toFixed(1)}%
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className={`h-2 rounded-full ${partition.percent > 90 ? 'bg-red-500' : partition.percent > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                    style={{ width: `${partition.percent}%` }}
                                ></div>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {partition.free_mb} MB free of {partition.total_mb} MB
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Network */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-bold mb-4">Network</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {metrics.network.interfaces.map((iface, idx) => (
                        <div key={idx} className="border border-gray-200 rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold">{iface.name}</span>
                                <span className={`text-xs px-2 py-1 rounded ${iface.is_up ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {iface.is_up ? 'UP' : 'DOWN'}
                                </span>
                            </div>
                            {iface.addresses.map((addr, aidx) => (
                                <p key={aidx} className="text-sm text-gray-600">
                                    {addr.type}: {addr.address}
                                </p>
                            ))}
                            {iface.mac_address && (
                                <p className="text-xs text-gray-500 mt-1">MAC: {iface.mac_address}</p>
                            )}
                        </div>
                    ))}
                </div>
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-sm text-gray-500">Sent</p>
                        <p className="font-semibold">{formatBytes(metrics.network.io_stats.bytes_sent)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Received</p>
                        <p className="font-semibold">{formatBytes(metrics.network.io_stats.bytes_recv)}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Packets Sent</p>
                        <p className="font-semibold">{metrics.network.io_stats.packets_sent.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Packets Received</p>
                        <p className="font-semibold">{metrics.network.io_stats.packets_recv.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Camera Status */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-bold mb-4">Camera Status</h3>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-gray-600">Camera Detected</span>
                        <span className={`font-semibold ${metrics.camera.detected ? 'text-green-600' : 'text-red-600'}`}>
                            {metrics.camera.detected ? '✓ Yes' : '✗ No'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-gray-600">Camera Supported</span>
                        <span className={`font-semibold ${metrics.camera.supported ? 'text-green-600' : 'text-red-600'}`}>
                            {metrics.camera.supported ? '✓ Yes' : '✗ No'}
                        </span>
                    </div>
                    {metrics.camera.cameras.length > 0 && (
                        <div className="mt-2">
                            <p className="text-sm text-gray-500 mb-1">Available Cameras:</p>
                            {metrics.camera.cameras.map((cam, idx) => (
                                <p key={idx} className="text-sm font-mono">{cam.device} - {cam.name}</p>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
