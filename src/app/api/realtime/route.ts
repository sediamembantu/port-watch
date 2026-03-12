import { NextResponse } from "next/server";
import { fetchRealtimeSnapshot } from "@/lib/aisstream-client";

export const maxDuration = 30;

export async function GET() {
  const hasApiKey = !!process.env.AISSTREAM_API_KEY;

  try {
    const snapshot = await fetchRealtimeSnapshot(10000);

    return NextResponse.json({
      ...snapshot,
      timestamp: new Date().toISOString(),
      source: "AISStream.io",
      hasApiKey,
      note: snapshot.messagesReceived === 0
        ? hasApiKey
          ? "API key found but no messages received. Check Vercel function logs for WebSocket errors."
          : "No AIS messages received. Ensure AISSTREAM_API_KEY is configured."
        : undefined,
    });
  } catch (error) {
    console.error("[realtime] AIS fetch error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch real-time vessel data",
        detail: error instanceof Error ? error.message : String(error),
        hasApiKey,
      },
      { status: 500 }
    );
  }
}
