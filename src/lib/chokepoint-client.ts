/**
 * IMF PortWatch Chokepoint Monitoring
 *
 * Tracks: Suez Canal, Bab el-Mandeb, Strait of Malacca, Strait of Hormuz,
 * and Cape of Good Hope.
 *
 * Uses the Daily_Chokepoints_Data service from PortWatch ArcGIS.
 * Fields: date (timestamp ms), portid, portname, n_total, capacity, etc.
 */

// ArcGIS Feature Service base (correct org ID: weJ1QsnbMYJlCHdG, services9 only)
const ARCGIS_BASE =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services";

const DAILY_CHOKEPOINTS_SERVICE = "Daily_Chokepoints_Data";

export const CHOKEPOINTS = {
  suez: { id: "chokepoint1", name: "Suez Canal" },
  babElMandeb: { id: "chokepoint2", name: "Bab el-Mandeb Strait" },
  malacca: { id: "chokepoint5", name: "Strait of Malacca" },
  hormuz: { id: "chokepoint6", name: "Strait of Hormuz" },
  capeOfGoodHope: { id: "chokepoint7", name: "Cape of Good Hope" },
} as const;

export type ChokepointKey = keyof typeof CHOKEPOINTS;

export interface ChokepointRecord {
  date: string;
  chokepointId: string;
  chokepointName: string;
  transitCount: number;
  avgWaitDays: number;
  congestionIndex: number;
  trend: "improving" | "stable" | "worsening";
}

export interface ChokepointSummary {
  chokepointId: string;
  chokepointName: string;
  current: ChokepointRecord | null;
  history: ChokepointRecord[];
  weeklyChange: number; // % change in transits vs prior week
  status: "normal" | "elevated" | "congested";
}

/**
 * Fetch chokepoint transit data for both Malacca and Hormuz from PortWatch.
 */
export async function fetchChokepointData(
  daysBack: number = 30
): Promise<ChokepointRecord[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceMs = since.getTime();

  const chokepointIds = Object.values(CHOKEPOINTS)
    .map((c) => `'${c.id}'`)
    .join(",");

  const whereClauses = [
    `portid IN (${chokepointIds}) AND date >= ${sinceMs}`,
    `portid IN (${chokepointIds})`,
  ];

  for (const where of whereClauses) {
    try {
      const params = new URLSearchParams({
        where,
        outFields: "*",
        orderByFields: "date DESC",
        resultRecordCount: "500",
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

  console.warn("[chokepoint] No chokepoint data found");
  return [];
}

// Keep backward-compatible alias
export const fetchMalaccaChokepointData = fetchChokepointData;

/**
 * Convert Unix timestamp (ms) to YYYY-MM-DD string.
 */
function timestampToDateStr(ts: unknown): string {
  const n = Number(ts);
  if (isNaN(n) || n === 0) return String(ts || "");
  return new Date(n).toISOString().split("T")[0];
}

// Map portid -> chokepoint config
const CHOKEPOINT_BY_ID = new Map<string, { id: string; name: string }>(
  Object.values(CHOKEPOINTS).map((c) => [c.id, c])
);

function normalizeChokepointData(
  features: Array<{ attributes: Record<string, unknown> }>
): ChokepointRecord[] {
  return features.map((f) => {
    const a = f.attributes;
    const portid = String(a.portid || "");
    const chokepoint = CHOKEPOINT_BY_ID.get(portid);
    return {
      date: timestampToDateStr(a.date),
      chokepointId: portid,
      chokepointName:
        chokepoint?.name || String(a.portname || "Unknown Chokepoint"),
      transitCount: Number(a.n_total || 0),
      avgWaitDays: 0,
      congestionIndex: 0,
      trend: "stable" as const,
    };
  });
}

/**
 * Compute a summary for a single chokepoint's records.
 */
export function computeChokepointSummary(
  records: ChokepointRecord[]
): ChokepointSummary {
  if (records.length === 0) {
    return {
      chokepointId: "",
      chokepointName: "",
      current: null,
      history: [],
      weeklyChange: 0,
      status: "normal",
    };
  }

  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));

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

  const changePct = Math.abs(weeklyChange);
  const status: "normal" | "elevated" | "congested" =
    changePct < 10
      ? "normal"
      : changePct < 25
        ? "elevated"
        : "congested";

  return {
    chokepointId: sorted[0].chokepointId,
    chokepointName: sorted[0].chokepointName,
    current: withTrends[0] ?? null,
    history: withTrends,
    weeklyChange: Math.round(weeklyChange * 10) / 10,
    status,
  };
}

/**
 * Compute summaries for all chokepoints from a mixed set of records.
 */
export function computeAllChokepointSummaries(
  records: ChokepointRecord[]
): Record<string, ChokepointSummary> {
  const byChokepoint: Record<string, ChokepointRecord[]> = {};
  for (const r of records) {
    if (!byChokepoint[r.chokepointId]) byChokepoint[r.chokepointId] = [];
    byChokepoint[r.chokepointId].push(r);
  }

  const summaries: Record<string, ChokepointSummary> = {};
  for (const [id, recs] of Object.entries(byChokepoint)) {
    summaries[id] = computeChokepointSummary(recs);
  }

  return summaries;
}
