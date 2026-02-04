import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { scrapeUmdDining } from "./scrapers/umdDining.mjs";

async function run() {
  if (process.env.UMD_DINING_FETCH_NUTRITION === undefined) {
    process.env.UMD_DINING_FETCH_NUTRITION = "true";
    console.log("[UMD Dining] UMD_DINING_FETCH_NUTRITION not set, defaulting to true.");
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL environment variable not set");
    process.exit(1);
  }

  const pool = await mysql.createPool(dbUrl);
  const db = drizzle(pool);
  console.log("[UMD Dining] manual scrape start");
  const added = await scrapeUmdDining({ db, date: new Date() });
  console.log("[UMD Dining] manual scrape done. Added", added);
  await pool.end();
}

run().catch((error) => {
  console.error("[UMD Dining] scrape failed:", error);
  process.exit(1);
});
