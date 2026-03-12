import { promises as fs } from "fs";
import path from "path";
import type { PortActivityRecord } from "./portwatch-client";

export interface DataSnapshot {
  timestamp: string;
  records: PortActivityRecord[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const SNAPSHOT_FILE = path.join(DATA_DIR, "latest-snapshot.json");

/**
 * Save a data snapshot to disk.
 * In production, replace with Vercel KV/Postgres.
 */
export async function saveSnapshot(snapshot: DataSnapshot): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));

  // Also save a dated archive
  const dateStr = new Date().toISOString().split("T")[0];
  const archiveFile = path.join(DATA_DIR, `snapshot-${dateStr}.json`);
  await fs.writeFile(archiveFile, JSON.stringify(snapshot, null, 2));
}

/**
 * Load the latest data snapshot from disk.
 */
export async function getLatestSnapshot(): Promise<DataSnapshot | null> {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Load all archived snapshots (for historical charts).
 */
export async function getArchivedSnapshots(): Promise<DataSnapshot[]> {
  try {
    const files = await fs.readdir(DATA_DIR);
    const snapshots: DataSnapshot[] = [];

    for (const file of files.filter((f) => f.startsWith("snapshot-"))) {
      const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
      snapshots.push(JSON.parse(raw));
    }

    return snapshots.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch {
    return [];
  }
}
