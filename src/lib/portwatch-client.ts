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

/**
 * Fetch activity data for all monitored Malaysian ports.
 * Uses a single query with ISO3='MYS' to get all ports at once.
 */
export async function fetchAllMalaysianPorts(
  daysBack: number = 30
): Promise<PortActivityRecord[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().split("T")[0];

  try {
    const params = new URLSearchParams({
      where: `ISO3='MYS' AND date>='${sinceStr}'`,
      outFields: "*",
      resultRecordCount: "2000",
      f: "json",
    });
    const url = `${ARCGIS_BASE}/${DAILY_PORTS_SERVICE}/FeatureServer/0/query?${params}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });

    if (!res.ok) {
      console.warn(`[portwatch] ArcGIS returned ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (data.error) {
      console.warn("[portwatch] ArcGIS error:", data.error.message);
      return [];
    }

    if (!data.features || data.features.length === 0) {
      console.warn("[portwatch] No features returned for MYS");
      return [];
    }

    console.log(`[portwatch] Fetched ${data.features.length} MYS records`);
    return normalizePortActivity(data.features);
  } catch (error) {
    console.error("[portwatch] Failed to fetch Malaysian port data:", error);
    return [];
  }
}

/**
 * Map an ArcGIS portname to our MALAYSIAN_PORTS config entry.
 * Uses fuzzy matching since ArcGIS names may differ slightly.
 */
function matchPort(apiPortName: string) {
  const name = apiPortName.toLowerCase();
  return MALAYSIAN_PORTS.find((p) => {
    const pName = p.name.toLowerCase();
    // Check if either name contains the other, or key words match
    return (
      name.includes(pName) ||
      pName.includes(name) ||
      name.includes(pName.split(" ")[0])
    );
  });
}

/**
 * Transform raw PortWatch Daily_Ports_Data attributes into our normalized format.
 *
 * Actual fields from the API:
 *   date, portid, portname, country, ISO3,
 *   portcalls (total), portcalls_container, portcalls_dry_bulk, etc.
 *   import (total trade estimate), import_container, etc.
 *   export (total trade estimate), export_container, etc.
 *
 * There is no disruption_score in the raw data — we derive a simple
 * activity deviation metric later in computeDisruptionSummary.
 */
export function normalizePortActivity(
  features: PortWatchResponse["features"]
): PortActivityRecord[] {
  const records: PortActivityRecord[] = [];

  for (const f of features) {
    const a = f.attributes;
    const apiPortName = String(a.portname || "");
    const port = matchPort(apiPortName);

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
      // No raw congestion/disruption in the API — set to 0, computed later
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
