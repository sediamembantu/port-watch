/**
 * OpenDOSM trade data client.
 *
 * Fetches Malaysia's monthly trade statistics from the DOSM storage CSV
 * (the API endpoint is unreliable, so we use the static CSV instead).
 *
 * Dataset: trade_sitc_1d (Monthly Trade by SITC Section)
 * Source: https://open.dosm.gov.my/data-catalogue/trade_sitc_1d
 * CSV: https://storage.dosm.gov.my/trade/trade_sitc_1d.csv
 */

const DOSM_CSV_URL = "https://storage.dosm.gov.my/trade/trade_sitc_1d.csv";

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
 * Parse a CSV string into TradeRecord[].
 * Expected columns: date, sitc_section, exports, imports
 */
function parseTradeCSV(csv: string): TradeRecord[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf("date");
  const sectionIdx = header.indexOf("sitc_section");
  const exportsIdx = header.indexOf("exports");
  const importsIdx = header.indexOf("imports");

  if (dateIdx < 0 || exportsIdx < 0 || importsIdx < 0) {
    console.error("[dosm] CSV missing required columns. Header:", header);
    return [];
  }

  const records: TradeRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const date = cols[dateIdx]?.trim() || "";
    if (!date) continue;

    const exports = Number(cols[exportsIdx]) || 0;
    const imports = Number(cols[importsIdx]) || 0;
    const section = sectionIdx >= 0 ? (cols[sectionIdx]?.trim() || "overall") : "overall";

    records.push({
      date,
      exports,
      imports,
      tradeBalance: exports - imports,
      category: section,
    });
  }

  return records;
}

/**
 * Fetch Malaysia's external trade data from DOSM storage CSV.
 */
export async function fetchTradeData(
  _monthsBack: number = 12
): Promise<TradeRecord[]> {
  console.log("[dosm] Fetching CSV:", DOSM_CSV_URL);
  const res = await fetch(DOSM_CSV_URL, { next: { revalidate: 86400 } });

  if (!res.ok) {
    console.error("[dosm] CSV fetch error:", res.status, res.statusText);
    return [];
  }

  const csv = await res.text();
  const records = parseTradeCSV(csv);
  console.log(`[dosm] Parsed ${records.length} records from CSV`);
  return records;
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
