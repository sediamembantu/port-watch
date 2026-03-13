import { NextResponse } from "next/server";

export const maxDuration = 60;

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
}

export async function GET() {
  const results: DebugResult[] = [];

  // --- Test DOSM trade data sources ---

  // 1. CSV source
  try {
    const csvUrl = "https://storage.dosm.gov.my/trade/trade_sitc_1d.csv";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(csvUrl, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);
    const text = await res.text();
    results.push({
      label: "Trade CSV (storage.dosm.gov.my)",
      status: res.status,
      size: text.length,
      preview: text.slice(0, 300),
    });
  } catch (e) {
    results.push({
      label: "Trade CSV (storage.dosm.gov.my)",
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 2. API source
  try {
    const apiUrl = "https://api.data.gov.my/data-catalogue?id=trade_sitc_1d&limit=3&sort=-date";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(apiUrl, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);
    const text = await res.text();
    results.push({
      label: "Trade API (api.data.gov.my)",
      status: res.status,
      size: text.length,
      preview: text.slice(0, 500),
    });
  } catch (e) {
    results.push({
      label: "Trade API (api.data.gov.my)",
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 3. Alternative: try the OpenDOSM API directly
  try {
    const altUrl = "https://api.dosm.gov.my/public/trade?limit=3";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(altUrl, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);
    const text = await res.text();
    results.push({
      label: "Trade alt API (api.dosm.gov.my)",
      status: res.status,
      size: text.length,
      preview: text.slice(0, 500),
    });
  } catch (e) {
    results.push({
      label: "Trade alt API (api.dosm.gov.my)",
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // --- Test chokepoint queries ---
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

  return NextResponse.json({ results }, { status: 200 });
}
