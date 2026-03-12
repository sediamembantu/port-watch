import { NextResponse } from "next/server";
import { getLatestSnapshot } from "@/lib/data-store";
import { computeDisruptionSummary } from "@/lib/portwatch-client";

export async function GET() {
  const snapshot = await getLatestSnapshot();

  if (!snapshot || snapshot.records.length === 0) {
    return NextResponse.json(
      {
        error: "No data available yet. Waiting for first cron run.",
        summary: null,
      },
      { status: 503 }
    );
  }

  const summary = computeDisruptionSummary(snapshot.records);

  return NextResponse.json({
    summary,
    lastUpdated: snapshot.timestamp,
  });
}
