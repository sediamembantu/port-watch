import { Redis } from "@upstash/redis";
import type { PortActivityRecord } from "./portwatch-client";
import type { TradeSummary } from "./opendosm-client";

export interface DataSnapshot {
  timestamp: string;
  records: PortActivityRecord[];
}

const LATEST_KEY = "portwatch:latest-snapshot";
const ARCHIVE_PREFIX = "portwatch:snapshot:";
const TRADE_KEY = "portwatch:trade-summary";

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/**
 * Save a data snapshot to Redis.
 */
export async function saveSnapshot(snapshot: DataSnapshot): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.warn("[data-store] Redis not configured, skipping save");
    return false;
  }

  const dateStr = new Date().toISOString().split("T")[0];

  await Promise.all([
    redis.set(LATEST_KEY, JSON.stringify(snapshot)),
    redis.set(`${ARCHIVE_PREFIX}${dateStr}`, JSON.stringify(snapshot), { ex: 90 * 86400 }),
  ]);
  return true;
}

/**
 * Load the latest data snapshot.
 */
export async function getLatestSnapshot(): Promise<DataSnapshot | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;

    const data = await redis.get<string>(LATEST_KEY);
    if (!data) return null;
    return typeof data === "string" ? JSON.parse(data) : data as unknown as DataSnapshot;
  } catch {
    return null;
  }
}

/**
 * Save trade summary to Redis (30-day TTL — data updates monthly).
 */
export async function saveTradeSummary(summary: TradeSummary): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.warn("[data-store] Redis not configured, skipping trade save");
    return false;
  }

  await redis.set(TRADE_KEY, JSON.stringify(summary), { ex: 30 * 86400 });
  return true;
}

/**
 * Load cached trade summary from Redis.
 */
export async function getTradeSummary(): Promise<TradeSummary | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;

    const data = await redis.get<string>(TRADE_KEY);
    if (!data) return null;
    return typeof data === "string" ? JSON.parse(data) : data as unknown as TradeSummary;
  } catch {
    return null;
  }
}

/**
 * Load archived snapshots for historical charts.
 */
export async function getArchivedSnapshots(): Promise<DataSnapshot[]> {
  try {
    const redis = getRedis();
    if (!redis) return [];

    const keys = await redis.keys(`${ARCHIVE_PREFIX}*`);
    if (keys.length === 0) return [];

    const snapshots: DataSnapshot[] = [];
    for (const key of keys.sort()) {
      const data = await redis.get<string>(key);
      if (data) {
        const snapshot = typeof data === "string" ? JSON.parse(data) : data as unknown as DataSnapshot;
        snapshots.push(snapshot);
      }
    }

    return snapshots;
  } catch {
    return [];
  }
}
