/**
 * Helper script to download DOSM trade CSV for local development.
 *
 * Usage: npx tsx scripts/download-dosm-trade.ts
 *    or: npm run update-trade-data
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const CSV_URL = "https://storage.dosm.gov.my/trade/trade_sitc_1d.csv";
const OUTPUT_DIR = join(process.cwd(), "public", "data");
const OUTPUT_FILE = join(OUTPUT_DIR, "trade_sitc_1d.csv");

async function main() {
  console.log(`Fetching DOSM trade CSV from ${CSV_URL} ...`);
  const res = await fetch(CSV_URL);

  if (!res.ok) {
    console.error(`Failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const csv = await res.text();
  const lines = csv.trim().split("\n");
  console.log(`Downloaded ${lines.length - 1} rows (+ header)`);

  // Show date range
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf("date");
  if (dateIdx >= 0 && lines.length > 2) {
    const dates = lines
      .slice(1)
      .map((l) => l.split(",")[dateIdx]?.trim())
      .filter(Boolean)
      .sort();
    console.log(`Date range: ${dates[0]} → ${dates[dates.length - 1]}`);
  }

  // Save to public/data/
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, csv);
  console.log(`Saved to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
