import { NextResponse } from "next/server";

export const maxDuration = 60;

const BASE =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services";

export async function GET() {
  const results: Array<{
    label: string;
    status: number | string;
    featureCount?: number;
    sampleFields?: string[];
    sampleValues?: Record<string, unknown>;
    sampleValues2?: Record<string, unknown>;
    error?: string;
  }> = [];

  // Test chokepoint queries with date DESC ordering
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
