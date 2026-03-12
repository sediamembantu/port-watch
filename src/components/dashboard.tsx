"use client";

import type { DisruptionSummary } from "@/lib/portwatch-client";
import { DisruptionGauge } from "./disruption-gauge";
import { PortTable } from "./port-table";
import { ActivityChart } from "./activity-chart";
import { AlertBanner } from "./alert-banner";
import { ChokepointPanel } from "./chokepoint-panel";

interface DashboardProps {
  summary: DisruptionSummary;
  chartData: Array<{ date: string } & Record<string, string | number>>;
  ports: string[];
}

export function Dashboard({ summary, chartData, ports }: DashboardProps) {
  return (
    <div className="space-y-6">
      <AlertBanner alerts={summary.alerts} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DisruptionGauge
          score={summary.overallScore}
          label="Overall Disruption Index"
        />
        <DisruptionGauge
          score={
            summary.portScores.find((p) => p.portName === "Port Klang")
              ?.score ?? 0
          }
          label="Port Klang"
        />
        <DisruptionGauge
          score={
            summary.portScores.find((p) => p.portName === "Tanjung Pelepas")
              ?.score ?? 0
          }
          label="Tanjung Pelepas"
        />
      </div>

      <ChokepointPanel />

      <ActivityChart
        data={chartData}
        title="Disruption Score (30 days)"
        dataKey="disruptionScore"
        ports={ports}
      />

      <PortTable portScores={summary.portScores} />

      <div className="text-xs text-gray-600">
        Data: IMF PortWatch | Methodology:
        Trade-weighted disruption scoring | Updated: {summary.date}
      </div>
    </div>
  );
}
