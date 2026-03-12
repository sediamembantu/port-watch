import { NextResponse } from "next/server";
import { fetchTradeData, computeTradeSummary } from "@/lib/opendosm-client";

export async function GET() {
  try {
    const records = await fetchTradeData(12);
    const summary = computeTradeSummary(records);

    return NextResponse.json({
      summary,
      recordCount: records.length,
      timestamp: new Date().toISOString(),
      source: "OpenDOSM / data.gov.my",
    });
  } catch (error) {
    console.error("[trade] Fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trade data" },
      { status: 500 }
    );
  }
}
