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
    error?: string;
  }> = [];

  // 1. Chokepoint debug: try different queries for chokepoint5 and chokepoint6
  const chokepointQueries = [
    "portid IN ('chokepoint5','chokepoint6')",
    "portid='chokepoint5'",
    "portid='chokepoint6'",
    "portname LIKE '%Malacca%'",
    "portname LIKE '%Hormuz%'",
    "1=1",
  ];

  for (const where of chokepointQueries) {
    try {
      const params = new URLSearchParams({
        where,
        outFields: "*",
        resultRecordCount: "3",
        f: "json",
      });
      const url = `${BASE}/Daily_Chokepoints_Data/FeatureServer/0/query?${params}`;
      const res = await fetch(url);
      const data = await res.json();
      results.push({
        label: `Chokepoints | ${where}`,
        status: res.status,
        featureCount: data.features?.length ?? 0,
        sampleFields: data.features?.[0]
          ? Object.keys(data.features[0].attributes)
          : [],
        sampleValues: data.features?.[0]?.attributes,
        error: data.error?.message,
      });
    } catch (e) {
      results.push({
        label: `Chokepoints | ${where}`,
        status: `error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  // 2. Check the service metadata to see layer info
  try {
    const url = `${BASE}/Daily_Chokepoints_Data/FeatureServer/0?f=json`;
    const res = await fetch(url);
    const data = await res.json();
    results.push({
      label: "Chokepoints | Layer metadata",
      status: res.status,
      sampleValues: {
        name: data.name,
        type: data.type,
        maxRecordCount: data.maxRecordCount,
        fields: data.fields?.map((f: { name: string; type: string }) => `${f.name}(${f.type})`),
      },
      error: data.error?.message,
    });
  } catch (e) {
    results.push({
      label: "Chokepoints | Layer metadata",
      status: `error: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  return NextResponse.json({ results }, { status: 200 });
}
