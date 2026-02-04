import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { scrapeUmdDining } from "./scrapers/umdDining.mjs";

function parseDate(value) {
  if (!value) return null;
  const [month, day, year] = value.split(/[\\/\\-]/).map(Number);
  if (!month || !day || !year) return null;
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL environment variable not set");
    process.exit(1);
  }

  const startDate = parseDate(process.env.START_DATE);
  const endDate = parseDate(process.env.END_DATE);
  if (!startDate || !endDate) {
    console.error("Provide START_DATE and END_DATE as MM/DD/YYYY.");
    process.exit(1);
  }

  const pool = await mysql.createPool(dbUrl);
  const db = drizzle(pool);

  let cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  console.log(`[UMD Dining] Backfill ${formatDate(cursor)} -> ${formatDate(end)}`);
  while (cursor <= end) {
    console.log(`[UMD Dining] Scraping ${formatDate(cursor)}...`);
    await scrapeUmdDining({ db, date: new Date(cursor) });
    cursor.setDate(cursor.getDate() + 1);
  }

  await pool.end();
  console.log("[UMD Dining] Backfill complete.");
}

run().catch((error) => {
  console.error("[UMD Dining] Backfill failed:", error);
  process.exit(1);
});
