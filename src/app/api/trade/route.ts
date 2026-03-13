import { NextResponse } from "next/server";
import { fetchTradeData, computeTradeSummary } from "@/lib/opendosm-client";
import { getTradeSummary, saveTradeSummary } from "@/lib/data-store";

export async function GET() {
  try {
    // Try Redis cache first (populated by cron job)
    const cached = await getTradeSummary();
    if (cached && cached.latestMonth) {
      return NextResponse.json({
        summary: cached,
        source: "OpenDOSM / data.gov.my (cached)",
        timestamp: new Date().toISOString(),
      });
    }

    // Fallback: fetch CSV directly
    const records = await fetchTradeData(12);
    const summary = computeTradeSummary(records);

    // Cache for next time
    if (summary.latestMonth) {
      await saveTradeSummary(summary).catch(() => {});
    }

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
