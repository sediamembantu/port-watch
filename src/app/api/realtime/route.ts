import { NextResponse } from "next/server";
import { fetchRealtimeSnapshot } from "@/lib/aisstream-client";

export const maxDuration = 30;

export async function GET() {
  try {
    // Collect AIS data for 10 seconds (serverless-friendly short burst)
    const snapshot = await fetchRealtimeSnapshot(10000);

    return NextResponse.json({
      ...snapshot,
      timestamp: new Date().toISOString(),
      source: "AISStream.io",
      note: snapshot.messagesReceived === 0
        ? "No AIS messages received. Ensure AISSTREAM_API_KEY is configured."
        : undefined,
    });
  } catch (error) {
    console.error("[realtime] AIS fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch real-time vessel data" },
      { status: 500 }
    );
  }
}
