import { NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DEBUG_VERSION = "v2-trade-sources";

const BASE =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services";

interface DebugResult {
  label: string;
  status: number | string;
  featureCount?: number;
  sampleFields?: string[];
  sampleValues?: Record<string, unknown>;
  sampleValues2?: Record<string, unknown>;
  error?: string;
  size?: number;
  preview?: string;
  elapsed?: number;
}

async function testSource(
  label: string,
  url: string,
  timeoutMs: number = 8000
): Promise<DebugResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);
    const text = await res.text();
    return {
      label,
      status: res.status,
      size: text.length,
      preview: text.slice(0, 400),
      elapsed: Date.now() - start,
    };
  } catch (e) {
    return {
      label,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
      elapsed: Date.now() - start,
    };
  }
}

export async function GET() {
  const results: DebugResult[] = [];

  // Run all trade source tests in parallel (with short timeouts)
  const tradeTests = await Promise.all([
    testSource(
      "Trade CSV (storage.dosm.gov.my)",
      "https://storage.dosm.gov.my/trade/trade_sitc_1d.csv",
      8000
    ),
    testSource(
      "Trade API (api.data.gov.my)",
      "https://api.data.gov.my/data-catalogue?id=trade_sitc_1d&limit=3&sort=-date",
      8000
    ),
    testSource(
      "Trade alt API (api.dosm.gov.my)",
      "https://api.dosm.gov.my/public/trade?limit=3",
      8000
    ),
  ]);
  results.push(...tradeTests);

  // Test chokepoint queries
  const chokepointQueries = [
    "portid='chokepoint5'",
    "portid='chokepoint6'",
    "portid IN ('chokepoint5','chokepoint6')",
  ];

  for (const where of chokepointQueries) {
    try {
      const params = new URLSearchParams({
        where,
        outFields: "date,portid,portname,n_total,capacity",
        orderByFields: "date DESC",
        resultRecordCount: "2",
        f: "json",
      });
      const url = `${BASE}/Daily_Chokepoints_Data/FeatureServer/0/query?${params}`;
      const res = await fetch(url);
      const data = await res.json();
      results.push({
        label: `Chokepoints | ${where} (DESC)`,
        status: res.status,
        featureCount: data.features?.length ?? 0,
        sampleValues: data.features?.[0]?.attributes,
        sampleValues2: data.features?.[1]?.attributes,
        error: data.error?.message,
      });
    } catch (e) {
      results.push({
        label: `Chokepoints | ${where} (DESC)`,
        status: `error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return NextResponse.json(
    { version: DEBUG_VERSION, timestamp: new Date().toISOString(), results },
    { status: 200 }
  );
}
