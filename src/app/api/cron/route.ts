import { NextRequest, NextResponse } from "next/server";
import { fetchAllMalaysianPorts } from "@/lib/portwatch-client";
import { saveSnapshot, saveTradeSummary } from "@/lib/data-store";
import { fetchChokepointData } from "@/lib/chokepoint-client";
import { fetchTradeData, computeTradeSummary } from "@/lib/opendosm-client";

export const maxDuration = 60; // Allow up to 60s for fetching all ports

export async function GET(request: NextRequest) {
  // Verify cron secret in production
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[cron] Fetching Malaysian port data + chokepoint data...");

    const [records, chokepointRecords, tradeRecords] = await Promise.all([
      fetchAllMalaysianPorts(30).catch((err) => {
        console.error("[cron] Port fetch failed:", err);
        return [];
      }),
      fetchChokepointData(30).catch((err) => {
        console.warn("[cron] Chokepoint fetch failed (non-fatal):", err);
        return [];
      }),
      fetchTradeData(12).catch((err) => {
        console.warn("[cron] Trade data fetch failed (non-fatal):", err);
        return [];
      }),
    ]);

    console.log(
      `[cron] Fetched ${records.length} port records, ${chokepointRecords.length} chokepoint records, ${tradeRecords.length} trade records`
    );

    // Save trade summary to Redis
    let tradeSaved = false;
    if (tradeRecords.length > 0) {
      try {
        const tradeSummary = computeTradeSummary(tradeRecords);
        tradeSaved = await saveTradeSummary(tradeSummary);
      } catch (err) {
        console.warn("[cron] Trade summary save failed (non-fatal):", err);
      }
    }

    let saved = false;
    let saveError: string | undefined;

    if (records.length > 0) {
      try {
        saved = await saveSnapshot({
          timestamp: new Date().toISOString(),
          records,
        });
      } catch (err) {
        saveError = err instanceof Error ? err.message : String(err);
        console.error("[cron] Redis save failed:", saveError);
      }
    }

    // List KV/Redis env vars for debugging
    const kvEnvVars = Object.keys(process.env).filter(
      (k) => k.includes("KV") || k.includes("REDIS") || k.includes("UPSTASH") || k.includes("STORAGE")
    );

    return NextResponse.json({
      success: true,
      recordCount: records.length,
      chokepointRecordCount: chokepointRecords.length,
      tradeRecordCount: tradeRecords.length,
      saved,
      tradeSaved,
      saveError,
      kvEnvVars,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron] Failed:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch port data",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
