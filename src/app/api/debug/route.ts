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

  // 1. Query Daily_Ports_Data with 1=1 to see fields
  try {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      resultRecordCount: "2",
      f: "json",
    });
    const url = `${BASE}/Daily_Ports_Data/FeatureServer/0/query?${params}`;
    const res = await fetch(url);
    const data = await res.json();
    results.push({
      label: "Daily_Ports_Data | 1=1",
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
      label: "Daily_Ports_Data | 1=1",
      status: `error: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  // 2. Query Daily_Chokepoints_Data with 1=1 to see fields
  try {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      resultRecordCount: "2",
      f: "json",
    });
    const url = `${BASE}/Daily_Chokepoints_Data/FeatureServer/0/query?${params}`;
    const res = await fetch(url);
    const data = await res.json();
    results.push({
      label: "Daily_Chokepoints_Data | 1=1",
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
      label: "Daily_Chokepoints_Data | 1=1",
      status: `error: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  // 3. Try querying Daily_Ports_Data for Malaysian port (Port Klang = MYPKG)
  const portWhereClauses = [
    "portid='MYPKG'",
    "LOCODE='MYPKG'",
    "port_code='MYPKG'",
    "portname LIKE '%Klang%'",
  ];

  for (const where of portWhereClauses) {
    try {
      const params = new URLSearchParams({
        where,
        outFields: "*",
        resultRecordCount: "2",
        f: "json",
      });
      const url = `${BASE}/Daily_Ports_Data/FeatureServer/0/query?${params}`;
      const res = await fetch(url);
      const data = await res.json();
      results.push({
        label: `Daily_Ports_Data | ${where}`,
        status: res.status,
        featureCount: data.features?.length ?? 0,
        sampleValues: data.features?.[0]?.attributes,
        error: data.error?.message,
      });
    } catch (e) {
      results.push({
        label: `Daily_Ports_Data | ${where}`,
        status: `error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return NextResponse.json({ results }, { status: 200 });
}
