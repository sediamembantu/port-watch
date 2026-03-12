/**
 * OpenDOSM / data.gov.my API client for Malaysian trade statistics.
 *
 * API base: https://api.data.gov.my
 * Docs: https://developer.data.gov.my/
 *
 * Provides trade volume context to complement port-level disruption data.
 */

const DOSM_API_BASE = "https://api.data.gov.my";

export interface TradeRecord {
  date: string;
  exports: number; // RM millions
  imports: number; // RM millions
  tradeBalance: number; // RM millions
  category: string;
}

export interface TradeSummary {
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
    exports: number; // % change year-over-year
    imports: number;
  };
}

/**
 * Fetch Malaysia's external trade data from OpenDOSM.
 * Tries multiple known dataset endpoints.
 */
export async function fetchTradeData(
  monthsBack: number = 12
): Promise<TradeRecord[]> {
  // Known dataset slugs for trade data on data.gov.my
  const datasetSlugs = [
    "trade",
    "external-trade",
    "tradestat",
    "trade-monthly",
  ];

  for (const slug of datasetSlugs) {
    try {
      const records = await queryDOSMDataset(slug, monthsBack);
      if (records.length > 0) return records;
    } catch {
      continue;
    }
  }

  // Fallback: try the catalog search
  try {
    return await searchAndFetchTrade(monthsBack);
  } catch {
    return [];
  }
}

/**
 * Query a specific DOSM dataset.
 */
async function queryDOSMDataset(
  slug: string,
  monthsBack: number
): Promise<TradeRecord[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  const sinceStr = since.toISOString().split("T")[0];

  const params = new URLSearchParams({
    date_start: sinceStr,
    limit: "100",
    sort: "-date",
  });

  const url = `${DOSM_API_BASE}/data-catalogue/${slug}?${params}`;
  const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h

  if (!res.ok) return [];

  const data = await res.json();
  return normalizeTradeData(data);
}

/**
 * Search the DOSM catalog for trade-related datasets.
 */
async function searchAndFetchTrade(
  monthsBack: number
): Promise<TradeRecord[]> {
  // Try the catalog endpoint
  const searchUrl = `${DOSM_API_BASE}/data-catalogue?search=trade&limit=5`;
  const searchRes = await fetch(searchUrl, { next: { revalidate: 86400 } });

  if (!searchRes.ok) return [];

  const catalog = await searchRes.json();
  const datasets = Array.isArray(catalog)
    ? catalog
    : catalog.data || catalog.results || [];

  // Look for trade-related datasets
  for (const ds of datasets) {
    const id = ds.id || ds.slug || ds.meta?.id;
    if (!id) continue;

    const name = String(ds.title || ds.name || "").toLowerCase();
    if (
      name.includes("trade") ||
      name.includes("export") ||
      name.includes("import")
    ) {
      try {
        const records = await queryDOSMDataset(id, monthsBack);
        if (records.length > 0) return records;
      } catch {
        continue;
      }
    }
  }

  return [];
}

/**
 * Normalize various DOSM response formats into TradeRecords.
 */
function normalizeTradeData(data: unknown): TradeRecord[] {
  // Handle different response structures
  const items: Record<string, unknown>[] = Array.isArray(data)
    ? data
    : (data as Record<string, unknown>)?.data
      ? (
          (data as Record<string, unknown[]>).data || []
        ).filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" && item !== null
        )
      : [];

  return items
    .map((item) => {
      const date = String(
        item.date || item.period || item.month || ""
      );
      const exports = Number(item.exports || item.export_value || item.x || 0);
      const imports = Number(item.imports || item.import_value || item.m || 0);

      return {
        date,
        exports,
        imports,
        tradeBalance: exports - imports,
        category: String(item.category || item.section || "Total"),
      };
    })
    .filter((r) => r.date);
}

/**
 * Compute a trade summary from raw records.
 */
export function computeTradeSummary(records: TradeRecord[]): TradeSummary {
  if (records.length === 0) {
    return {
      latestMonth: "",
      totalExports: 0,
      totalImports: 0,
      tradeBalance: 0,
      monthlyTrend: [],
      topCategories: [],
      yoyChange: { exports: 0, imports: 0 },
    };
  }

  // Get totals (aggregate "Total" category or sum all)
  const totals = records.filter(
    (r) => r.category === "Total" || r.category === ""
  );
  const useRecords = totals.length > 0 ? totals : records;

  const sorted = [...useRecords].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const latest = sorted[0];
  const latestMonth = latest.date;

  // Monthly trend
  const monthlyTrend = sorted.slice(0, 12).reverse().map((r) => ({
    date: r.date,
    exports: r.exports,
    imports: r.imports,
    balance: r.tradeBalance,
  }));

  // Year-over-year change
  const yearAgo = sorted.find((r) => {
    const latestDate = new Date(latestMonth);
    const rDate = new Date(r.date);
    const diffMonths =
      (latestDate.getFullYear() - rDate.getFullYear()) * 12 +
      (latestDate.getMonth() - rDate.getMonth());
    return diffMonths >= 11 && diffMonths <= 13;
  });

  const yoyExports = yearAgo
    ? ((latest.exports - yearAgo.exports) / yearAgo.exports) * 100
    : 0;
  const yoyImports = yearAgo
    ? ((latest.imports - yearAgo.imports) / yearAgo.imports) * 100
    : 0;

  // Top categories (from non-total records)
  const byCategory = records
    .filter((r) => r.category !== "Total" && r.category !== "")
    .reduce(
      (acc, r) => {
        if (!acc[r.category]) acc[r.category] = 0;
        acc[r.category] += r.exports + r.imports;
        return acc;
      },
      {} as Record<string, number>
    );

  const topCategories = Object.entries(byCategory)
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    latestMonth,
    totalExports: latest.exports,
    totalImports: latest.imports,
    tradeBalance: latest.tradeBalance,
    monthlyTrend,
    topCategories,
    yoyChange: {
      exports: Math.round(yoyExports * 10) / 10,
      imports: Math.round(yoyImports * 10) / 10,
    },
  };
}
