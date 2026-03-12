"use client";

import { useState, useEffect, useCallback } from "react";

interface TradeSummary {
  latestMonth: string;
  totalExports: number;
  totalImports: number;
  tradeBalance: number;
  monthlyTrend: Array<{
    date: string;
    exports: number;
    imports: number;
    balance: number;
  }>;
  topCategories: Array<{
    category: string;
    value: number;
  }>;
  yoyChange: {
    exports: number;
    imports: number;
  };
}

function formatRM(value: number): string {
  if (value >= 1000) return `RM ${(value / 1000).toFixed(1)}B`;
  return `RM ${value.toFixed(0)}M`;
}

export function TradePanel() {
  const [summary, setSummary] = useState<TradeSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trade");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      if (json.summary && json.summary.latestMonth) {
        setSummary(json.summary);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-400">
        Malaysia Trade Overview
      </h3>

      {loading && (
        <div className="animate-pulse space-y-2">
          <div className="h-6 rounded bg-gray-700" />
          <div className="h-4 rounded bg-gray-700 w-2/3" />
        </div>
      )}

      {!loading && summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded bg-gray-900 p-3 text-center">
              <div className="text-xl font-bold text-green-400">
                {formatRM(summary.totalExports)}
              </div>
              <div className="text-xs text-gray-500">Exports</div>
              {summary.yoyChange.exports !== 0 && (
                <div
                  className={`text-xs ${summary.yoyChange.exports > 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {summary.yoyChange.exports > 0 ? "+" : ""}
                  {summary.yoyChange.exports}% YoY
                </div>
              )}
            </div>
            <div className="rounded bg-gray-900 p-3 text-center">
              <div className="text-xl font-bold text-blue-400">
                {formatRM(summary.totalImports)}
              </div>
              <div className="text-xs text-gray-500">Imports</div>
              {summary.yoyChange.imports !== 0 && (
                <div
                  className={`text-xs ${summary.yoyChange.imports > 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {summary.yoyChange.imports > 0 ? "+" : ""}
                  {summary.yoyChange.imports}% YoY
                </div>
              )}
            </div>
            <div className="rounded bg-gray-900 p-3 text-center">
              <div
                className={`text-xl font-bold ${summary.tradeBalance >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {formatRM(summary.tradeBalance)}
              </div>
              <div className="text-xs text-gray-500">Trade Balance</div>
            </div>
          </div>

          {summary.monthlyTrend.length > 2 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-500">
                Monthly Trade Volume (12mo)
              </div>
              <div className="flex items-end gap-1" style={{ height: "48px" }}>
                {summary.monthlyTrend.map((m, i) => {
                  const maxVal = Math.max(
                    ...summary.monthlyTrend.map(
                      (t) => t.exports + t.imports
                    ),
                    1
                  );
                  const total = m.exports + m.imports;
                  const height = Math.max((total / maxVal) * 100, 4);
                  const exportPct =
                    total > 0 ? (m.exports / total) * 100 : 50;

                  return (
                    <div
                      key={i}
                      className="flex flex-1 flex-col"
                      title={`${m.date}: Exports ${formatRM(m.exports)}, Imports ${formatRM(m.imports)}`}
                      style={{ height: `${height}%` }}
                    >
                      <div
                        className="rounded-t-sm bg-green-600"
                        style={{ height: `${exportPct}%` }}
                      />
                      <div
                        className="rounded-b-sm bg-blue-600"
                        style={{ height: `${100 - exportPct}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-green-600" />{" "}
                  Exports
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-blue-600" />{" "}
                  Imports
                </span>
              </div>
            </div>
          )}

          {summary.topCategories.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-500">
                Top Trade Categories
              </div>
              {summary.topCategories.slice(0, 3).map((cat) => (
                <div
                  key={cat.category}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-gray-300">{cat.category}</span>
                  <span className="text-gray-400">{formatRM(cat.value)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs text-gray-600">
            Latest: {summary.latestMonth}
          </div>
        </div>
      )}

      {!loading && !summary && (
        <p className="text-sm text-gray-500">
          Trade data unavailable — OpenDOSM API may not have matching datasets.
        </p>
      )}

      <div className="mt-2 text-xs text-gray-600">
        Source: OpenDOSM / data.gov.my
      </div>
    </div>
  );
}
