import { NextResponse } from "next/server";
import { MALAYSIAN_PORTS } from "@/lib/ports";
import { getLatestSnapshot } from "@/lib/data-store";

export async function GET() {
  const snapshot = await getLatestSnapshot();

  return NextResponse.json({
    ports: MALAYSIAN_PORTS,
    lastUpdated: snapshot?.timestamp ?? null,
    data: snapshot?.records ?? [],
  });
}
