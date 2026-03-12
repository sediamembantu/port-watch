import { MALAYSIAN_PORTS } from "./ports";

// IMF PortWatch dataset IDs on ArcGIS Hub
const DAILY_PORT_ACTIVITY_DATASET_IDS = [
  "959214444157458aad969389b3ebe1a0",
  "75619cb86e5f4beeb7dab9629d861acf",
];

// ArcGIS Feature Service bases to try (correct org ID: weJ1QsnbMYJlCHdG)
const ARCGIS_BASES = [
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services",
  "https://services.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services",
];

// Known service names for PortWatch feature layers
const SERVICE_NAMES = [
  "PortWatch_ports_database",
  "Daily_Port_Activity_Data_and_Trade_Estimates",
  "PortWatch_Portal",
];

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
 * Tries multiple service names and falls back to Hub GeoJSON download.
 */
export async function fetchPortActivity(
  portUnlocode: string,
  daysBack: number = 30
): Promise<PortWatchResponse> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().split("T")[0];

  // Try different field name patterns for port code and date
  const whereClauses = [
    `port_code='${portUnlocode}' AND date_str>='${sinceStr}'`,
    `locode='${portUnlocode}' AND date_str>='${sinceStr}'`,
    `portcode='${portUnlocode}' AND date_str>='${sinceStr}'`,
  ];

  // Try each ArcGIS base + service name + field name combination
  for (const base of ARCGIS_BASES) {
    for (const serviceName of SERVICE_NAMES) {
      for (const whereClause of whereClauses) {
        try {
          const params = new URLSearchParams({
            where: whereClause,
            outFields: "*",
            orderByFields: "date_str DESC",
            resultRecordCount: "100",
            f: "json",
          });
          const url = `${base}/${serviceName}/FeatureServer/0/query?${params}`;
          const res = await fetch(url, { next: { revalidate: 3600 } });
          if (!res.ok) continue;

          const data = await res.json();
          if (data.features && data.features.length > 0) {
            return data;
          }
          // ArcGIS returns 200 with error object for invalid service/field names
          if (data.error) continue;
        } catch {
          continue;
        }
      }
    }
  }

  // Fallback: Hub GeoJSON download (contains all ports, filter client-side)
  return fetchPortDataFromHub(portUnlocode, sinceStr);
}

/**
 * Fetch port activity data from the Hub download API (GeoJSON).
 * Downloads the full dataset and filters for the requested port.
 */
async function fetchPortDataFromHub(
  portUnlocode: string,
  sinceStr: string
): Promise<PortWatchResponse> {
  for (const datasetId of DAILY_PORT_ACTIVITY_DATASET_IDS) {
    try {
      const url = `https://portwatch-imf-dataviz.hub.arcgis.com/api/download/v1/items/${datasetId}/geojson?layers=0`;
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (!res.ok) continue;

      const geojson = await res.json();
      if (!geojson.features) continue;

      // Filter for our port and date range
      const filtered = geojson.features
        .filter((f: { properties: Record<string, unknown> }) => {
          const props = f.properties;
          const code = String(props.port_code || props.portcode || props.locode || "");
          const date = String(props.date_str || props.date || "");
          return code === portUnlocode && date >= sinceStr;
        })
        .map((f: { properties: Record<string, unknown>; geometry?: { coordinates?: number[] } }) => ({
          attributes: f.properties,
          geometry: f.geometry?.coordinates
            ? { x: f.geometry.coordinates[0] as number, y: f.geometry.coordinates[1] as number }
            : undefined,
        }));

      if (filtered.length > 0) {
        return { features: filtered };
      }
    } catch {
      continue;
    }
  }

  // All sources exhausted — return empty instead of throwing
  console.warn(`No PortWatch data found for ${portUnlocode}`);
  return { features: [] };
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
