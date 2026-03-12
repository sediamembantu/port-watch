import { getLatestSnapshot } from "@/lib/data-store";
import { computeDisruptionSummary } from "@/lib/portwatch-client";
import { MALAYSIAN_PORTS } from "@/lib/ports";
import { Dashboard } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snapshot = await getLatestSnapshot();
  const hasData = snapshot && snapshot.records.length > 0;

  const summary = hasData ? computeDisruptionSummary(snapshot.records) : null;

  const chartData = hasData ? buildChartData(snapshot.records) : [];

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Portch Watch</h1>
          <p className="mt-1 text-gray-400">
            Malaysian port supply disruption monitor
          </p>
          {snapshot && (
            <p className="mt-1 text-xs text-gray-500">
              Last updated: {new Date(snapshot.timestamp).toLocaleString()}
            </p>
          )}
        </header>

        {!hasData ? (
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-8 text-center">
            <h2 className="text-xl font-semibold text-gray-300">
              Awaiting first data fetch
            </h2>
            <p className="mt-2 text-gray-500">
              The cron job runs daily at 06:00 UTC. You can trigger it manually
              via <code className="text-blue-400">/api/cron</code>.
            </p>
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-medium text-gray-400">
                Monitored Ports
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {MALAYSIAN_PORTS.map((port) => (
                  <div
                    key={port.id}
                    className="rounded border border-gray-700 bg-gray-800 p-3 text-left"
                  >
                    <div className="text-sm font-medium">{port.name}</div>
                    <div className="text-xs text-gray-500">
                      {port.unlocode} &middot; {port.tradeShare}% share
                    </div>
                    <div className="text-xs text-gray-600">{port.type}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Dashboard
            summary={summary!}
            chartData={chartData}
            ports={MALAYSIAN_PORTS.map((p) => p.name)}
          />
        )}
      </div>
    </main>
  );
}

function buildChartData(
  records: { portName: string; date: string; disruptionScore: number }[]
) {
  const byDate: Record<string, Record<string, number>> = {};

  for (const r of records) {
    if (!byDate[r.date]) byDate[r.date] = {};
    byDate[r.date][r.portName] = r.disruptionScore;
  }

  return Object.entries(byDate)
    .map(([date, ports]) => ({ date, ...ports }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
