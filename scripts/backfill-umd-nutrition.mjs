import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import { foodItems } from "../drizzle/schema.ts";
import { fetchFoodNutrition } from "./scrapers/umdDining.mjs";

const DINING_HALLS = [
  { name: "South Campus", locationNum: 16 },
  { name: "Yahentamitsi Dining Hall", locationNum: 19 },
  { name: "251 North", locationNum: 51 },
];

function parseDate(value) {
  if (!value) return null;
  const [month, day, year] = value.split(/[\\/\\-]/).map(Number);
  if (!month || !day || !year) return null;
  return new Date(year, month - 1, day);
}

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL environment variable not set");
    process.exit(1);
  }

  const targetDate = parseDate(process.env.MENU_DATE);
  if (!targetDate) {
    console.error("Provide MENU_DATE as MM/DD/YYYY.");
    process.exit(1);
  }
  targetDate.setHours(0, 0, 0, 0);

  const pool = await mysql.createPool(dbUrl);
  const db = drizzle(pool);

  const hallMap = new Map(DINING_HALLS.map((hall) => [hall.name, hall]));

  const rows = await db
    .select({
      recNumAndPort: foodItems.recNumAndPort,
      name: foodItems.name,
      diningHall: foodItems.diningHall,
      station: foodItems.station,
      menuDate: foodItems.menuDate,
      calories: foodItems.calories,
      protein: foodItems.protein,
      carbs: foodItems.carbs,
      fat: foodItems.fat,
    })
    .from(foodItems)
    .where(and(eq(foodItems.menuDate, targetDate), eq(foodItems.calories, 0)));

  let updated = 0;
  for (const row of rows) {
    const hall = hallMap.get(row.diningHall);
    if (!hall) continue;
    const nutrition = await fetchFoodNutrition(
      hall,
      targetDate,
      row.recNumAndPort,
      row.name
    );
    if (!nutrition) continue;

    await db
      .update(foodItems)
      .set({
        calories: nutrition.calories ?? row.calories ?? 0,
        protein: nutrition.protein ?? row.protein ?? 0,
        carbs: nutrition.carbs ?? row.carbs ?? 0,
        fat: nutrition.fat ?? row.fat ?? 0,
        saturatedFat: nutrition.saturatedFat ?? null,
        transFat: nutrition.transFat ?? null,
        cholesterol: nutrition.cholesterol ?? null,
        sodium: nutrition.sodium ?? null,
        fiber: nutrition.fiber ?? null,
        sugars: nutrition.sugars ?? null,
        ingredients: nutrition.ingredients || null,
        allergens: nutrition.allergens?.length ? JSON.stringify(nutrition.allergens) : null,
        lastUpdated: new Date(),
      })
      .where(
        and(
          eq(foodItems.recNumAndPort, row.recNumAndPort),
          eq(foodItems.diningHall, row.diningHall),
          eq(foodItems.station, row.station),
          eq(foodItems.menuDate, targetDate)
        )
      );

    updated += 1;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.log(`[UMD Dining] Nutrition backfill complete. Updated ${updated} items.`);
  await pool.end();
}

run().catch((error) => {
  console.error("[UMD Dining] Nutrition backfill failed:", error);
  process.exit(1);
});
