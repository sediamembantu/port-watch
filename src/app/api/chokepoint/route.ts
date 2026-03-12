import { NextResponse } from "next/server";
import {
  fetchMalaccaChokepointData,
  computeChokepointSummary,
} from "@/lib/chokepoint-client";

export async function GET() {
  try {
    const records = await fetchMalaccaChokepointData(30);
    const summary = computeChokepointSummary(records);

    return NextResponse.json({
      summary,
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
