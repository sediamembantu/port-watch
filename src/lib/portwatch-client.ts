import { MALAYSIAN_PORTS } from "./ports";

// IMF PortWatch ArcGIS Hub dataset endpoints
// These are the public ArcGIS Feature Service layers for PortWatch data
const PORTWATCH_HUB_BASE =
  "https://portwatch-imf-dataviz.hub.arcgis.com/api/download/v1/items";

// Known PortWatch ArcGIS Feature Service base
// The actual feature service IDs may change — these are discovered from the Hub
const ARCGIS_FEATURE_SERVICE =
  "https://services.arcgis.com/5T5nSi527N4F7luB/arcgis/rest/services";

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
 * Query PortWatch ArcGIS Feature Service for a specific port's data.
 * Uses the ArcGIS REST API query endpoint.
 */
export async function fetchPortActivity(
  portUnlocode: string,
  daysBack: number = 30
): Promise<PortWatchResponse> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().split("T")[0];

  // Query the PortWatch feature layer
  // The feature service exposes port-level daily activity
  const params = new URLSearchParams({
    where: `port_code='${portUnlocode}' AND date_str>='${sinceStr}'`,
    outFields: "*",
    orderByFields: "date_str DESC",
    resultRecordCount: "100",
    f: "json",
  });

  const url = `${ARCGIS_FEATURE_SERVICE}/PortWatch_Portal_Portal_Portal/FeatureServer/0/query?${params}`;

  const res = await fetch(url, {
    next: { revalidate: 3600 }, // cache for 1 hour
  });

  if (!res.ok) {
    throw new Error(`PortWatch API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Fetch port activity data from the Hub download API (CSV/GeoJSON).
 * This is the fallback approach when the Feature Service layer ID is unknown.
 */
export async function fetchPortDataFromHub(
  datasetId: string,
  format: "geojson" | "csv" = "geojson"
): Promise<unknown> {
  const url = `${PORTWATCH_HUB_BASE}/${datasetId}/geojson?layers=0`;

  const res = await fetch(url, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`PortWatch Hub download error: ${res.status}`);
  }

  return res.json();
}

/**
 * Transform raw PortWatch feature attributes into our normalized format.
 */
export function normalizePortActivity(
  features: PortWatchResponse["features"],
  portId: string,
  portName: string,
  unlocode: string
): PortActivityRecord[] {
  return features.map((f) => {
    const a = f.attributes;
    return {
      portId,
      portName,
      unlocode,
      date: String(a.date_str || a.Date || ""),
      vesselCount: Number(a.n_vessels || a.vessel_count || 0),
      importIndex: Number(a.import_index || a.Import || 0),
      exportIndex: Number(a.export_index || a.Export || 0),
      congestionIndex: Number(a.congestion || a.Congestion || 0),
      disruptionScore: Number(a.disruption_score || a.Disruption || 0),
    };
  });
}

/**
 * Fetch activity data for all monitored Malaysian ports.
 */
export async function fetchAllMalaysianPorts(
  daysBack: number = 30
): Promise<PortActivityRecord[]> {
  const results = await Promise.allSettled(
    MALAYSIAN_PORTS.map(async (port) => {
      try {
        const response = await fetchPortActivity(port.unlocode, daysBack);
        return normalizePortActivity(
          response.features || [],
          port.id,
          port.name,
          port.unlocode
        );
      } catch (error) {
        console.error(`Failed to fetch data for ${port.name}:`, error);
        return [];
      }
    })
  );

  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

/**
 * Compute a disruption summary for nowcasting.
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
  const latest = records.reduce(
    (acc, r) => {
      if (!acc[r.portId] || r.date > acc[r.portId].date) {
        acc[r.portId] = r;
      }
      return acc;
    },
    {} as Record<string, PortActivityRecord>
  );

  const portScores = Object.values(latest).map((r) => {
    // Compute 7-day trend for this port
    const portRecords = records
      .filter((pr) => pr.portId === r.portId)
      .sort((a, b) => b.date.localeCompare(a.date));

    const recent = portRecords.slice(0, 7);
    const prior = portRecords.slice(7, 14);

    const recentAvg =
      recent.length > 0
        ? recent.reduce((s, x) => s + x.disruptionScore, 0) / recent.length
        : 0;
    const priorAvg =
      prior.length > 0
        ? prior.reduce((s, x) => s + x.disruptionScore, 0) / prior.length
        : recentAvg;

    const diff = recentAvg - priorAvg;
    const trend: "improving" | "stable" | "worsening" =
      diff < -0.05 ? "improving" : diff > 0.05 ? "worsening" : "stable";

    return {
      portId: r.portId,
      portName: r.portName,
      score: r.disruptionScore,
      vesselCount: r.vesselCount,
      trend,
    };
  });

  // Weight by trade share
  const port = MALAYSIAN_PORTS;
  const weightedScore = portScores.reduce((sum, ps) => {
    const p = port.find((pp) => pp.id === ps.portId);
    const weight = p ? p.tradeShare / 100 : 0;
    return sum + ps.score * weight;
  }, 0);

  const alerts: string[] = [];
  for (const ps of portScores) {
    if (ps.score > 0.7) {
      alerts.push(`HIGH disruption at ${ps.portName} (score: ${ps.score.toFixed(2)})`);
    }
    if (ps.trend === "worsening" && ps.score > 0.4) {
      alerts.push(`${ps.portName} disruption is worsening`);
    }
  }

  const latestDate = Object.values(latest).reduce(
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
