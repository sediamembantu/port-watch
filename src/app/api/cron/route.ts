import { NextRequest, NextResponse } from "next/server";
import { fetchAllMalaysianPorts } from "@/lib/portwatch-client";
import { saveSnapshot } from "@/lib/data-store";
import { fetchMalaccaChokepointData } from "@/lib/chokepoint-client";

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

    const [records, chokepointRecords] = await Promise.all([
      fetchAllMalaysianPorts(30),
      fetchMalaccaChokepointData(30).catch((err) => {
        console.warn("[cron] Chokepoint fetch failed (non-fatal):", err);
        return [];
      }),
    ]);

    console.log(
      `[cron] Fetched ${records.length} port records, ${chokepointRecords.length} chokepoint records`
    );

    await saveSnapshot({
      timestamp: new Date().toISOString(),
      records,
    });

    return NextResponse.json({
      success: true,
      recordCount: records.length,
      chokepointRecordCount: chokepointRecords.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron] Failed to fetch port data:", error);
    return NextResponse.json(
      { error: "Failed to fetch port data" },
      { status: 500 }
    );
  }
}
