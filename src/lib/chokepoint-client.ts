/**
 * IMF PortWatch Chokepoint Monitoring — Strait of Malacca
 *
 * Dataset: Daily Chokepoint Transit data from PortWatch ArcGIS Hub
 * Dataset ID: 42132aa4e2fc4d41bdaf9a445f688931
 */

// Use the correct PortWatch org ID
const ARCGIS_BASES = [
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services",
  "https://services.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services",
];

export interface ChokepointRecord {
  date: string;
  chokepointName: string;
  transitCount: number;
  avgWaitDays: number;
  congestionIndex: number;
  trend: "improving" | "stable" | "worsening";
}

export interface ChokepointSummary {
  current: ChokepointRecord | null;
  history: ChokepointRecord[];
  weeklyChange: number; // % change in transits vs prior week
  status: "normal" | "elevated" | "congested";
}

/**
 * Fetch Strait of Malacca chokepoint transit data from PortWatch.
 */
export async function fetchMalaccaChokepointData(
  daysBack: number = 30
): Promise<ChokepointRecord[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().split("T")[0];

  const params = new URLSearchParams({
    where: `(chokepoint_name LIKE '%Malacca%' OR chokepoint_name LIKE '%malacca%' OR chokepoint_name LIKE '%Singapore%') AND date_str>='${sinceStr}'`,
    outFields: "*",
    orderByFields: "date_str DESC",
    resultRecordCount: "200",
    f: "json",
  });

  // Try multiple possible service names for the chokepoint layer
  const serviceNames = [
    "PortWatch_Chokepoints_Portal/FeatureServer/0",
    "PortWatch_Portal_Portal_Portal/FeatureServer/1",
    "Daily_Chokepoint_Transit/FeatureServer/0",
    "chokepoint_daily/FeatureServer/0",
  ];

  for (const base of ARCGIS_BASES) {
    for (const serviceName of serviceNames) {
      try {
        const url = `${base}/${serviceName}/query?${params}`;
        const res = await fetch(url, { next: { revalidate: 3600 } });

        if (!res.ok) continue;

        const data = await res.json();
        if (data.features && data.features.length > 0) {
          return normalizeChokepointData(data.features);
        }
      } catch {
        continue;
      }
    }
  }

  // Fallback: try the Hub download API
  try {
    return await fetchChokepointFromHub();
  } catch {
    return [];
  }
}

/**
 * Fallback: fetch chokepoint data via ArcGIS Hub download API.
 */
async function fetchChokepointFromHub(): Promise<ChokepointRecord[]> {
  const datasetId = "42132aa4e2fc4d41bdaf9a445f688931";
  const url = `https://portwatch-imf-dataviz.hub.arcgis.com/api/download/v1/items/${datasetId}/geojson?layers=0`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const geojson = await res.json();
  if (!geojson.features) return [];

  // Filter for Malacca Strait entries
  const malaccaFeatures = geojson.features.filter(
    (f: { properties: Record<string, unknown> }) => {
      const name = String(
        f.properties.chokepoint_name || f.properties.name || ""
      ).toLowerCase();
      return name.includes("malacca") || name.includes("singapore");
    }
  );

  return malaccaFeatures.map(
    (f: { properties: Record<string, unknown> }) => {
      const p = f.properties;
      return {
        date: String(p.date_str || p.date || ""),
        chokepointName: String(
          p.chokepoint_name || p.name || "Strait of Malacca"
        ),
        transitCount: Number(p.n_vessels || p.transit_count || 0),
        avgWaitDays: Number(p.avg_wait || p.wait_days || 0),
        congestionIndex: Number(p.congestion || p.congestion_index || 0),
        trend: "stable" as const,
      };
    }
  );
}

function normalizeChokepointData(
  features: Array<{ attributes: Record<string, unknown> }>
): ChokepointRecord[] {
  return features.map((f) => {
    const a = f.attributes;
    return {
      date: String(a.date_str || a.Date || ""),
      chokepointName: String(
        a.chokepoint_name || a.name || "Strait of Malacca"
      ),
      transitCount: Number(a.n_vessels || a.transit_count || 0),
      avgWaitDays: Number(a.avg_wait || a.wait_days || 0),
      congestionIndex: Number(a.congestion || a.congestion_index || 0),
      trend: "stable" as const,
    };
  });
}

/**
 * Compute a summary for the Strait of Malacca chokepoint.
 */
export function computeChokepointSummary(
  records: ChokepointRecord[]
): ChokepointSummary {
  if (records.length === 0) {
    return {
      current: null,
      history: [],
      weeklyChange: 0,
      status: "normal",
    };
  }

  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));

  // Compute 7-day trends
  const recent7 = sorted.slice(0, 7);
  const prior7 = sorted.slice(7, 14);

  const recentAvgTransits =
    recent7.length > 0
      ? recent7.reduce((s, r) => s + r.transitCount, 0) / recent7.length
      : 0;
  const priorAvgTransits =
    prior7.length > 0
      ? prior7.reduce((s, r) => s + r.transitCount, 0) / prior7.length
      : recentAvgTransits;

  const weeklyChange =
    priorAvgTransits > 0
      ? ((recentAvgTransits - priorAvgTransits) / priorAvgTransits) * 100
      : 0;

  // Add trend to each record
  const withTrends = sorted.map((r, i) => {
    if (i >= sorted.length - 1) return { ...r, trend: "stable" as const };
    const next = sorted[i + 1];
    const diff = r.transitCount - next.transitCount;
    const pctDiff = next.transitCount > 0 ? diff / next.transitCount : 0;
    return {
      ...r,
      trend:
        pctDiff < -0.05
          ? ("improving" as const)
          : pctDiff > 0.05
            ? ("worsening" as const)
            : ("stable" as const),
    };
  });

  // Determine overall status from congestion index
  const latestCongestion = withTrends[0]?.congestionIndex ?? 0;
  const status: "normal" | "elevated" | "congested" =
    latestCongestion < 0.3
      ? "normal"
      : latestCongestion < 0.6
        ? "elevated"
        : "congested";

  return {
    current: withTrends[0] ?? null,
    history: withTrends,
    weeklyChange: Math.round(weeklyChange * 10) / 10,
    status,
  };
}
