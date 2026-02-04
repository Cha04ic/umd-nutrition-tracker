import "dotenv/config";
import fs from "fs";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { scrapeUmdDining } from "./scrapers/umdDining.mjs";
import { scrapePopeyesPdf } from "./scrapers/restaurants/popeyes_pdf.mjs";
import { scrapeSubway } from "./scrapers/restaurants/subway.mjs";
import { scrapePotbelly } from "./scrapers/restaurants/potbelly.mjs";
import { scrapeChipotle } from "./scrapers/restaurants/chipotle.mjs";

async function seedDatabase() {
  try {
    console.log("Starting menu scraper and database population...\n");

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error("DATABASE_URL environment variable not set");
      process.exit(1);
    }

    const pool = await mysql.createPool(dbUrl);
    const db = drizzle(pool);

    let totalItemsAdded = 0;

    totalItemsAdded += await scrapeUmdDining({ db, date: new Date() });
    const popeyesPdfPath = process.env.POPEYES_PDF_PATH || "scripts/data/popeyes_nutrition.pdf";
    if (fs.existsSync(popeyesPdfPath)) {
      totalItemsAdded += await scrapePopeyesPdf({ db, pdfPath: popeyesPdfPath });
    }
    totalItemsAdded += await scrapePotbelly({ db });
    totalItemsAdded += await scrapeChipotle({ db });
    totalItemsAdded += await scrapeSubway({ db });

    console.log(`\nSeeding complete! Added ${totalItemsAdded} new food items.\n`);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("Fatal error during seeding:", error);
    process.exit(1);
  }
}

seedDatabase();
