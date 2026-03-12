/**
 * OpenDOSM / data.gov.my API client for Malaysian trade statistics.
 *
 * Dataset: trade_sitc_1d (Monthly Trade by SITC Section)
 * API: https://api.data.gov.my/data-catalogue?id=trade_sitc_1d
 * Source: https://open.dosm.gov.my/data-catalogue/trade_sitc_1d
 */

const DOSM_API = "https://api.data.gov.my/data-catalogue";

export interface TradeRecord {
  date: string;
  exports: number; // RM millions
  imports: number; // RM millions
  tradeBalance: number; // RM millions
  category: string; // SITC section or "overall"
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
 * Uses the trade_sitc_1d dataset (Monthly Trade by SITC Section).
 */
export async function fetchTradeData(
  _monthsBack: number = 12
): Promise<TradeRecord[]> {
  const params = new URLSearchParams({
    id: "trade_sitc_1d",
    limit: "200",
    sort: "-date",
  });

  const url = `${DOSM_API}?${params}`;
  console.log("[dosm] Fetching:", url);
  const res = await fetch(url, { next: { revalidate: 86400 } });

  if (!res.ok) {
    console.error("[dosm] API error:", res.status, res.statusText);
    return [];
  }

  const data: unknown = await res.json();
  const items = Array.isArray(data) ? data : [];

  return items
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    )
    .map((item) => {
      const date = String(item.date || "");
      const exports = Number(item.exports || 0);
      const imports = Number(item.imports || 0);
      const section = String(item.sitc_section ?? item.section ?? "overall");

      return {
        date,
        exports,
        imports,
        tradeBalance: exports - imports,
        category: section,
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

  // Use "overall" rows for totals
  const totals = records.filter((r) => r.category === "overall");
  const useRecords = totals.length > 0 ? totals : records;

  const sorted = [...useRecords].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const latest = sorted[0];
  const latestMonth = latest.date;

  // Monthly trend
  const monthlyTrend = sorted
    .slice(0, 12)
    .reverse()
    .map((r) => ({
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

  // Top categories (from non-overall records, latest month only)
  const latestSections = records.filter(
    (r) => r.date === latestMonth && r.category !== "overall"
  );
  const topCategories = latestSections
    .map((r) => ({
      category: getSITCLabel(r.category),
      value: r.exports + r.imports,
    }))
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

/** Map SITC 1-digit codes to readable labels. */
function getSITCLabel(code: string): string {
  const labels: Record<string, string> = {
    "0": "Food & Live Animals",
    "1": "Beverages & Tobacco",
    "2": "Crude Materials",
    "3": "Mineral Fuels",
    "4": "Animal & Vegetable Oils",
    "5": "Chemicals",
    "6": "Manufactured Goods",
    "7": "Machinery & Transport",
    "8": "Misc. Manufactured",
    "9": "Other Commodities",
  };
  return labels[code] || `SITC ${code}`;
}
