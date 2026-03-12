"use client";

import { useState, useEffect, useCallback } from "react";

interface ChokepointRecord {
  date: string;
  chokepointId: string;
  chokepointName: string;
  transitCount: number;
  avgWaitDays: number;
  congestionIndex: number;
  trend: "improving" | "stable" | "worsening";
}

interface ChokepointSummary {
  chokepointId: string;
  chokepointName: string;
  current: ChokepointRecord | null;
  history: ChokepointRecord[];
  weeklyChange: number;
  status: "normal" | "elevated" | "congested";
}

const statusColor = {
  normal: "text-green-400",
  elevated: "text-yellow-400",
  congested: "text-red-400",
};

const statusBorder = {
  normal: "border-green-800",
  elevated: "border-yellow-800",
  congested: "border-red-800",
};

const barColor: Record<string, string> = {
  chokepoint5: "bg-cyan-600",
  chokepoint6: "bg-orange-500",
};

function SingleChokepointCard({ summary }: { summary: ChokepointSummary }) {
  if (!summary.current) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
        <h4 className="mb-2 text-sm font-medium text-gray-400">
          {summary.chokepointName || "Chokepoint"}
        </h4>
        <p className="text-sm text-gray-500">
          Data unavailable — will populate on next PortWatch update.
        </p>
      </div>
    );
  }

  const color = barColor[summary.chokepointId] || "bg-cyan-600";

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <h4 className="mb-3 text-sm font-medium text-gray-400">
        {summary.chokepointName}
      </h4>

      <div
        className={`rounded border ${statusBorder[summary.status]} bg-gray-900 p-3 mb-3`}
      >
        <div className="flex items-center justify-between">
          <span
            className={`text-lg font-bold ${statusColor[summary.status]}`}
          >
            {summary.status.charAt(0).toUpperCase() +
              summary.status.slice(1)}
          </span>
          <span className="text-xs text-gray-500">
            {summary.current.date}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="rounded bg-gray-900 p-3 text-center">
          <div className="text-xl font-bold text-white">
            {summary.current.transitCount}
          </div>
          <div className="text-xs text-gray-500">Daily Transits</div>
        </div>
        <div className="rounded bg-gray-900 p-3 text-center">
          <div
            className={`text-xl font-bold ${summary.weeklyChange > 0 ? "text-green-400" : summary.weeklyChange < 0 ? "text-red-400" : "text-gray-300"}`}
          >
            {summary.weeklyChange > 0 ? "+" : ""}
            {summary.weeklyChange}%
          </div>
          <div className="text-xs text-gray-500">Weekly Change</div>
        </div>
        <div className="rounded bg-gray-900 p-3 text-center">
          <div className="text-xl font-bold text-white">
            {(summary.current.congestionIndex * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-gray-500">Congestion</div>
        </div>
      </div>

      {summary.history.length > 1 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-500">
            Recent Transit History
          </div>
          <div className="flex gap-1">
            {summary.history
              .slice(0, 14)
              .reverse()
              .map((r, i) => {
                const maxTransit = Math.max(
                  ...summary.history.map((h) => h.transitCount),
                  1
                );
                const height = Math.max(
                  (r.transitCount / maxTransit) * 100,
                  4
                );
                return (
                  <div
                    key={i}
                    className="flex-1"
                    title={`${r.date}: ${r.transitCount} transits`}
                  >
                    <div
                      className={`rounded-sm ${color}`}
                      style={{ height: `${height}%`, minHeight: "2px" }}
                    />
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ChokepointPanel() {
  const [summaries, setSummaries] = useState<
    Record<string, ChokepointSummary>
  >({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/chokepoint");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setSummaries(json.summaries || {});
    } catch {
      // silently fail - data may not be available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Prefer Hormuz first (the "problem area"), then Malacca
  const orderedIds = ["chokepoint6", "chokepoint5"];
  const available = orderedIds.filter((id) => summaries[id]);
  const hasSummaries = available.length > 0;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-400">
        Chokepoint Monitor
      </h3>

      {loading && (
        <div className="animate-pulse space-y-2">
          <div className="h-6 rounded bg-gray-700" />
          <div className="h-4 rounded bg-gray-700 w-2/3" />
        </div>
      )}

      {!loading && hasSummaries && (
        <div className="grid gap-4 md:grid-cols-2">
          {available.map((id) => (
            <SingleChokepointCard key={id} summary={summaries[id]} />
          ))}
        </div>
      )}

      {!loading && !hasSummaries && (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <p className="text-sm text-gray-500">
            Chokepoint data unavailable — will populate on next PortWatch
            update.
          </p>
        </div>
      )}

      <div className="text-xs text-gray-600">
        Source: IMF PortWatch Chokepoint Data
      </div>
    </div>
  );
}
