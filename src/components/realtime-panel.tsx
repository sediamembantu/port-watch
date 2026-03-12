"use client";

import { useState, useEffect, useCallback } from "react";

interface PortVesselCount {
  portId: string;
  portName: string;
  vesselCount: number;
  arrivals: number;
  transiting: number;
  lastUpdated: string;
}

interface MalaccaTransits {
  totalVessels: number;
  uniqueVessels: number;
  avgSpeed: number;
  lastUpdated: string;
}

interface RealtimeData {
  portVessels: PortVesselCount[];
  malaccaTransits: MalaccaTransits;
  messagesReceived: number;
  timestamp: string;
  note?: string;
}

export function RealtimePanel() {
  const [data, setData] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/realtime");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Unable to fetch real-time data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeVessels = data?.portVessels.filter((p) => p.vesselCount > 0) ?? [];
  const totalVesselsInPorts = data?.portVessels.reduce((s, p) => s + p.vesselCount, 0) ?? 0;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-400">
          Real-time Vessel Tracking
        </h3>
        <div className="flex items-center gap-2">
          {data?.messagesReceived === 0 && !loading && (
            <span className="text-xs text-yellow-500">No API key configured</span>
          )}
          <div
            className={`h-2 w-2 rounded-full ${loading ? "animate-pulse bg-yellow-500" : data && data.messagesReceived > 0 ? "bg-green-500" : "bg-gray-600"}`}
          />
          <span className="text-xs text-gray-500">
            {loading ? "Scanning..." : "AISStream.io"}
          </span>
          <button
            onClick={fetchData}
            disabled={loading}
            className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {data && data.messagesReceived > 0 && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-3">
            <div className="rounded bg-gray-900 p-3 text-center">
              <div className="text-2xl font-bold text-blue-400">
                {totalVesselsInPorts}
              </div>
              <div className="text-xs text-gray-500">Vessels in Port Areas</div>
            </div>
            <div className="rounded bg-gray-900 p-3 text-center">
              <div className="text-2xl font-bold text-cyan-400">
                {data.malaccaTransits.uniqueVessels}
              </div>
              <div className="text-xs text-gray-500">Malacca Strait Transits</div>
            </div>
            <div className="rounded bg-gray-900 p-3 text-center">
              <div className="text-2xl font-bold text-gray-300">
                {data.malaccaTransits.avgSpeed} kn
              </div>
              <div className="text-xs text-gray-500">Avg Strait Speed</div>
            </div>
          </div>

          {activeVessels.length > 0 && (
            <div className="space-y-1">
              {activeVessels.map((p) => (
                <div
                  key={p.portId}
                  className="flex items-center justify-between rounded bg-gray-900 px-3 py-2"
                >
                  <span className="text-sm text-white">{p.portName}</span>
                  <div className="flex gap-4 text-xs">
                    <span className="text-green-400">
                      {p.arrivals} berthing
                    </span>
                    <span className="text-gray-400">
                      {p.transiting} transiting
                    </span>
                    <span className="font-medium text-white">
                      {p.vesselCount} total
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 text-xs text-gray-600">
            {data.messagesReceived} AIS messages received | Updated:{" "}
            {new Date(data.timestamp).toLocaleTimeString()}
          </div>
        </>
      )}

      {data && data.messagesReceived === 0 && !loading && (
        <div className="rounded bg-gray-900 p-4 text-center">
          <p className="text-sm text-gray-400">
            Configure <code className="text-blue-400">AISSTREAM_API_KEY</code> for live vessel tracking
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Free API key from aisstream.io
          </p>
        </div>
      )}
    </div>
  );
}
