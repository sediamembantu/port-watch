import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET() {
  const bases = [
    "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services",
    "https://services.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services",
  ];

  const serviceNames = [
    "PortWatch_ports_database",
    "Daily_Port_Activity_Data_and_Trade_Estimates",
    "PortWatch_Portal",
  ];

  const results: Array<{
    url: string;
    status: number | string;
    featureCount?: number;
    sampleFields?: string[];
    error?: string;
  }> = [];

  // Step 1: Try to discover available services
  for (const base of bases) {
    try {
      const res = await fetch(`${base}?f=json`);
      const data = await res.json();
      results.push({
        url: `${base}?f=json`,
        status: res.status,
        sampleFields: data.services?.map((s: { name: string; type: string }) => `${s.name} (${s.type})`) ?? [],
        error: data.error?.message,
      });
    } catch (e) {
      results.push({
        url: `${base}?f=json`,
        status: `error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  // Step 2: Try each service name to get layer info
  for (const base of bases) {
    for (const serviceName of serviceNames) {
      try {
        const url = `${base}/${serviceName}/FeatureServer?f=json`;
        const res = await fetch(url);
        const data = await res.json();
        results.push({
          url,
          status: res.status,
          sampleFields: data.layers?.map((l: { id: number; name: string }) => `Layer ${l.id}: ${l.name}`) ?? [],
          error: data.error?.message,
        });
      } catch (e) {
        results.push({
          url: `${base}/${serviceName}/FeatureServer?f=json`,
          status: `error: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }

  // Step 3: Try querying with different field names
  const whereClauses = [
    "1=1",
    "port_code='MYPKG'",
    "locode='MYPKG'",
    "portcode='MYPKG'",
  ];

  for (const base of bases.slice(0, 1)) {
    for (const serviceName of serviceNames) {
      for (const where of whereClauses) {
        try {
          const params = new URLSearchParams({
            where,
            outFields: "*",
            resultRecordCount: "2",
            f: "json",
          });
          const url = `${base}/${serviceName}/FeatureServer/0/query?${params}`;
          const res = await fetch(url);
          const data = await res.json();

          results.push({
            url: `${serviceName} | where=${where}`,
            status: res.status,
            featureCount: data.features?.length ?? 0,
            sampleFields: data.features?.[0]
              ? Object.keys(data.features[0].attributes)
              : [],
            error: data.error?.message,
          });

          // If we got results with 1=1, no need to try other where clauses for this service
          if (where === "1=1" && data.features?.length > 0) break;
          // If we got an error, skip other where clauses for this service
          if (data.error) break;
        } catch (e) {
          results.push({
            url: `${serviceName} | where=${where}`,
            status: `error: ${e instanceof Error ? e.message : String(e)}`,
          });
          break;
        }
      }
    }
  }

  return NextResponse.json({ results }, { status: 200 });
}
