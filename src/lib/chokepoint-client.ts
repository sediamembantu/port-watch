/**
 * IMF PortWatch Chokepoint Monitoring — Strait of Malacca
 *
 * Uses the Daily_Chokepoints_Data service from PortWatch ArcGIS.
 * Fields: date (timestamp ms), portid, portname, n_total, capacity, etc.
 */

// ArcGIS Feature Service base (correct org ID: weJ1QsnbMYJlCHdG, services9 only)
const ARCGIS_BASE =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services";

const DAILY_CHOKEPOINTS_SERVICE = "Daily_Chokepoints_Data";

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
  const sinceMs = since.getTime();

  // The date field is esriFieldTypeDate (Unix timestamp in ms)
  // portname contains the chokepoint name (e.g. "Strait of Malacca")
  const whereClauses = [
    `(portname LIKE '%Malacca%' OR portname LIKE '%malacca%' OR portname LIKE '%Singapore%') AND date >= ${sinceMs}`,
    `(portname LIKE '%Malacca%' OR portname LIKE '%malacca%' OR portname LIKE '%Singapore%')`,
  ];

  for (const where of whereClauses) {
    try {
      const params = new URLSearchParams({
        where,
        outFields: "*",
        resultRecordCount: "200",
        f: "json",
      });
      const url = `${ARCGIS_BASE}/${DAILY_CHOKEPOINTS_SERVICE}/FeatureServer/0/query?${params}`;
      console.log(`[chokepoint] Trying: ${where.substring(0, 80)}...`);
      const res = await fetch(url, { next: { revalidate: 3600 } });

      if (!res.ok) continue;

      const data = await res.json();
      if (data.error) {
        console.warn(`[chokepoint] ArcGIS error: ${data.error.message}`);
        continue;
      }

      if (data.features && data.features.length > 0) {
        console.log(`[chokepoint] Got ${data.features.length} records`);
        const records = normalizeChokepointData(data.features);
        // If we used the no-date fallback, filter client-side
        if (!where.includes("date >=")) {
          const sinceStr = since.toISOString().split("T")[0];
          return records.filter((r) => r.date >= sinceStr);
        }
        return records;
      }
    } catch (error) {
      console.error("[chokepoint] Query failed:", error);
      continue;
    }
  }

  console.warn("[chokepoint] No Malacca data found");
  return [];
}

/**
 * Convert Unix timestamp (ms) to YYYY-MM-DD string.
 */
function timestampToDateStr(ts: unknown): string {
  const n = Number(ts);
  if (isNaN(n) || n === 0) return String(ts || "");
  return new Date(n).toISOString().split("T")[0];
}

function normalizeChokepointData(
  features: Array<{ attributes: Record<string, unknown> }>
): ChokepointRecord[] {
  return features.map((f) => {
    const a = f.attributes;
    return {
      date: timestampToDateStr(a.date),
      chokepointName: String(a.portname || "Strait of Malacca"),
      transitCount: Number(a.n_total || 0),
      avgWaitDays: 0, // not available in this dataset
      congestionIndex: 0, // computed in summary from transit trends
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

  // Determine status from transit volume change
  const changePct = Math.abs(weeklyChange);
  const status: "normal" | "elevated" | "congested" =
    changePct < 10
      ? "normal"
      : changePct < 25
        ? "elevated"
        : "congested";

  return {
    current: withTrends[0] ?? null,
    history: withTrends,
    weeklyChange: Math.round(weeklyChange * 10) / 10,
    status,
  };
}
