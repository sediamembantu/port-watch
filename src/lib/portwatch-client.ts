import { MALAYSIAN_PORTS } from "./ports";

// ArcGIS Feature Service base (correct org ID: weJ1QsnbMYJlCHdG, services9 only)
const ARCGIS_BASE =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services";

// Daily port activity service (discovered via /api/debug)
const DAILY_PORTS_SERVICE = "Daily_Ports_Data";

export interface PortActivityRecord {
  portId: string;
  portName: string;
  unlocode: string;
  date: string;
  vesselCount: number;
  importIndex: number;
  exportIndex: number;
  congestionIndex: number;
  disruptionScore: number;
}

export interface PortWatchResponse {
  features: Array<{
    attributes: Record<string, unknown>;
    geometry?: { x: number; y: number };
  }>;
}

// Build a portid IN clause from our config
const PORT_IDS = MALAYSIAN_PORTS.map((p) => `'${p.portWatchId}'`).join(",");

// Lookup map: PortWatch portid -> our port config
const PORT_BY_WATCH_ID = new Map(
  MALAYSIAN_PORTS.map((p) => [p.portWatchId, p])
);

/**
 * Fetch activity data for all monitored Malaysian ports.
 * Uses a single query filtering by known portid values.
 */
export async function fetchAllMalaysianPorts(
  daysBack: number = 30
): Promise<PortActivityRecord[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().split("T")[0];

  // Try multiple date filter syntaxes since esriFieldTypeDateOnly
  // may need DATE keyword or string comparison
  const whereClauses = [
    `portid IN (${PORT_IDS}) AND date >= DATE '${sinceStr}'`,
    `portid IN (${PORT_IDS}) AND date >= '${sinceStr}'`,
    `portid IN (${PORT_IDS})`,
  ];

  for (const where of whereClauses) {
    try {
      const params = new URLSearchParams({
        where,
        outFields: "*",
        orderByFields: "date DESC",
        resultRecordCount: "2000",
        f: "json",
      });
      const url = `${ARCGIS_BASE}/${DAILY_PORTS_SERVICE}/FeatureServer/0/query?${params}`;
      console.log(`[portwatch] Trying: ${where}`);
      const res = await fetch(url, { next: { revalidate: 3600 } });

      if (!res.ok) {
        console.warn(`[portwatch] HTTP ${res.status} for query`);
        continue;
      }

      const data = await res.json();

      if (data.error) {
        console.warn(`[portwatch] ArcGIS error: ${data.error.message}`);
        continue;
      }

      if (data.features && data.features.length > 0) {
        console.log(`[portwatch] Got ${data.features.length} records`);

        // If we used the no-date fallback, filter client-side
        const records = normalizePortActivity(data.features);
        if (where.includes("date")) {
          return records;
        }
        // Client-side date filter for the fallback query
        return records.filter((r) => r.date >= sinceStr);
      }
    } catch (error) {
      console.error("[portwatch] Query failed:", error);
      continue;
    }
  }

  console.warn("[portwatch] All queries returned 0 results");
  return [];
}

/**
 * Transform raw PortWatch Daily_Ports_Data attributes into our normalized format.
 *
 * Actual fields from the API:
 *   date (DateOnly), portid, portname, country, ISO3,
 *   portcalls (total), portcalls_container, portcalls_dry_bulk, etc.
 *   import (total trade estimate), export (total trade estimate)
 */
export function normalizePortActivity(
  features: PortWatchResponse["features"]
): PortActivityRecord[] {
  const records: PortActivityRecord[] = [];

  for (const f of features) {
    const a = f.attributes;
    const watchId = String(a.portid || "");
    const port = PORT_BY_WATCH_ID.get(watchId);

    // Skip ports not in our monitored list
    if (!port) continue;

    records.push({
      portId: port.id,
      portName: port.name,
      unlocode: port.unlocode,
      date: String(a.date || ""),
      vesselCount: Number(a.portcalls || 0),
      importIndex: Number(a.import || 0),
      exportIndex: Number(a.export || 0),
      // No raw congestion/disruption in the API — computed in summary
      congestionIndex: 0,
      disruptionScore: 0,
    });
  }

  return records;
}

/**
 * Compute a disruption summary for nowcasting.
 *
 * Since the PortWatch Daily_Ports_Data doesn't include a disruption score,
 * we compute one based on port call deviation from the rolling average.
 * A significant drop in port calls indicates potential disruption.
 */
export interface DisruptionSummary {
  date: string;
  overallScore: number;
  portScores: Array<{
    portId: string;
    portName: string;
    score: number;
    vesselCount: number;
    trend: "improving" | "stable" | "worsening";
  }>;
  alerts: string[];
}

export function computeDisruptionSummary(
  records: PortActivityRecord[]
): DisruptionSummary {
  // Group records by port, sorted by date desc
  const byPort: Record<string, PortActivityRecord[]> = {};
  for (const r of records) {
    if (!byPort[r.portId]) byPort[r.portId] = [];
    byPort[r.portId].push(r);
  }

  const portScores = Object.entries(byPort).map(([portId, portRecords]) => {
    const sorted = portRecords.sort((a, b) => b.date.localeCompare(a.date));
    const latest = sorted[0];

    const recent = sorted.slice(0, 7);
    const prior = sorted.slice(7, 14);

    const recentAvg =
      recent.length > 0
        ? recent.reduce((s, x) => s + x.vesselCount, 0) / recent.length
        : 0;
    const priorAvg =
      prior.length > 0
        ? prior.reduce((s, x) => s + x.vesselCount, 0) / prior.length
        : recentAvg;

    // Disruption score: how much have port calls dropped?
    // Score 0 = normal/above average, Score 1 = severe drop
    let score = 0;
    if (priorAvg > 0) {
      const dropPct = (priorAvg - recentAvg) / priorAvg;
      score = Math.max(0, Math.min(1, dropPct));
    }

    const diff = recentAvg - priorAvg;
    const pctDiff = priorAvg > 0 ? diff / priorAvg : 0;
    const trend: "improving" | "stable" | "worsening" =
      pctDiff > 0.05 ? "improving" : pctDiff < -0.05 ? "worsening" : "stable";

    return {
      portId,
      portName: latest.portName,
      score: Math.round(score * 100) / 100,
      vesselCount: latest.vesselCount,
      trend,
    };
  });

  // Weight by trade share
  const weightedScore = portScores.reduce((sum, ps) => {
    const p = MALAYSIAN_PORTS.find((pp) => pp.id === ps.portId);
    const weight = p ? p.tradeShare / 100 : 0;
    return sum + ps.score * weight;
  }, 0);

  const alerts: string[] = [];
  for (const ps of portScores) {
    if (ps.score > 0.3) {
      alerts.push(
        `Significant port call drop at ${ps.portName} (score: ${ps.score.toFixed(2)})`
      );
    }
    if (ps.trend === "worsening") {
      alerts.push(`${ps.portName} activity is declining`);
    }
  }

  const latestDate = records.reduce(
    (max, r) => (r.date > max ? r.date : max),
    ""
  );

  return {
    date: latestDate,
    overallScore: Math.round(weightedScore * 100) / 100,
    portScores,
    alerts,
  };
}
