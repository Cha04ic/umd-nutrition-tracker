import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { foodItems } from '../drizzle/schema.ts';
import { SAMPLE_FOODS } from '../shared/sampleFoods.ts';


async function seedSampleData() {
  try {
    console.log('Starting sample data population...\n');
    
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('DATABASE_URL environment variable not set');
      process.exit(1);
    }

    const pool = await mysql.createPool(dbUrl);
    const db = drizzle(pool);

    let totalItemsAdded = 0;

    for (const food of SAMPLE_FOODS) {
      try {
        // Check if item already exists
        const existing = await db
          .select()
          .from(foodItems)
          .where(and(eq(foodItems.name, food.name), eq(foodItems.diningHall, food.diningHall)))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(foodItems).values({
            ...food,
            allergens: JSON.stringify([]),
            ingredients: 'Sample food item',
          });
          
          totalItemsAdded++;
          console.log(`✅ Added: ${food.name} (${food.diningHall} - ${food.station})`);
        } else {
          console.log(`⏭️  Already exists: ${food.name}`);
        }
      } catch (error) {
        console.error(`❌ Error adding ${food.name}:`, error.message);
      }
    }

    console.log(`\n✨ Sample data seeding complete! Added ${totalItemsAdded} food items to the database.\n`);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error during seeding:', error);
    process.exit(1);
  }
}

seedSampleData();
