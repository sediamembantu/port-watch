import { NextResponse } from "next/server";
import {
  fetchChokepointData,
  computeAllChokepointSummaries,
} from "@/lib/chokepoint-client";

export async function GET() {
  try {
    const records = await fetchChokepointData(30);
    const summaries = computeAllChokepointSummaries(records);

    return NextResponse.json({
      summaries,
      recordCount: records.length,
      timestamp: new Date().toISOString(),
      source: "IMF PortWatch Chokepoint Data",
    });
  } catch (error) {
    console.error("[chokepoint] Fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch chokepoint data" },
      { status: 500 }
    );
  }
}
