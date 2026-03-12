import { kv } from "@vercel/kv";
import type { PortActivityRecord } from "./portwatch-client";

export interface DataSnapshot {
  timestamp: string;
  records: PortActivityRecord[];
}

const LATEST_KEY = "portwatch:latest-snapshot";
const ARCHIVE_PREFIX = "portwatch:snapshot:";

/**
 * Save a data snapshot to Vercel KV.
 */
export async function saveSnapshot(snapshot: DataSnapshot): Promise<void> {
  const dateStr = new Date().toISOString().split("T")[0];

  await Promise.all([
    kv.set(LATEST_KEY, snapshot),
    kv.set(`${ARCHIVE_PREFIX}${dateStr}`, snapshot, { ex: 90 * 86400 }), // expire after 90 days
  ]);
}

/**
 * Load the latest data snapshot.
 */
export async function getLatestSnapshot(): Promise<DataSnapshot | null> {
  try {
    return await kv.get<DataSnapshot>(LATEST_KEY);
  } catch {
    return null;
  }
}

/**
 * Load archived snapshots for historical charts.
 */
export async function getArchivedSnapshots(): Promise<DataSnapshot[]> {
  try {
    const keys = await kv.keys(`${ARCHIVE_PREFIX}*`);
    if (keys.length === 0) return [];

    const snapshots: DataSnapshot[] = [];
    for (const key of keys.sort()) {
      const snapshot = await kv.get<DataSnapshot>(key);
      if (snapshot) snapshots.push(snapshot);
    }

    return snapshots;
  } catch {
    return [];
  }
}
