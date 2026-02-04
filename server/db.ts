import { eq, and, gte, lte, desc, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  nutritionGoals,
  NutritionGoals,
  foodItems,
  FoodItem,
  trackedMeals,
  TrackedMeal,
  connectedAccounts,
  ConnectedAccount,
  orderNotifications,
  OrderNotification,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserProfile(userId: number, updates: { name?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const set: Record<string, unknown> = {};
  if (updates.name !== undefined) {
    set.name = updates.name;
  }

  if (Object.keys(set).length === 0) return;

  await db.update(users).set(set).where(eq(users.id, userId));
}

// Nutrition Goals
export async function getNutritionGoals(userId: number): Promise<NutritionGoals | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(nutritionGoals).where(eq(nutritionGoals.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertNutritionGoals(userId: number, goals: Omit<NutritionGoals, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getNutritionGoals(userId);
  if (existing) {
    await db.update(nutritionGoals).set(goals).where(eq(nutritionGoals.userId, userId));
  } else {
    await db.insert(nutritionGoals).values({ ...goals, userId });
  }
}

// Food Items
export async function searchFoodItems(query: string, diningHall?: string): Promise<FoodItem[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  conditions.push(eq(foodItems.name, query)); // Exact match for now
  
  if (diningHall) {
    conditions.push(eq(foodItems.diningHall, diningHall));
  }

  const result = await db.select().from(foodItems).where(and(...conditions)).limit(50);
  return result;
}

export async function getFoodItemsByDiningHall(
  diningHall: string,
  userId?: number,
  menuDate?: Date,
  mealType?: string
): Promise<FoodItem[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(foodItems.diningHall, diningHall)];
  if (diningHall === "Your Own" && userId) {
    conditions.push(eq(foodItems.createdByUserId, userId));
  }
  if (menuDate) {
    const start = new Date(menuDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(menuDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(
      sql`(${foodItems.menuDate} BETWEEN ${start} AND ${end} OR (${foodItems.menuDate} IS NULL AND ${foodItems.lastUpdated} BETWEEN ${start} AND ${end}))`
    );
  }
  if (mealType) {
    const token = `|${mealType}|`;
    conditions.push(sql`${foodItems.mealTypes} LIKE ${`%${token}%`}`);
  }
  const result = await db.select().from(foodItems).where(and(...conditions));
  return result;
}

export async function listAllFoodItems(): Promise<FoodItem[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select().from(foodItems);
  return result;
}

export async function getUserCreatedFoodItems(): Promise<FoodItem[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select().from(foodItems).where(isNotNull(foodItems.createdByUserId));
  return result;
}

export async function getFoodItemById(id: number): Promise<FoodItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(foodItems).where(eq(foodItems.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertFoodItem(item: Omit<FoodItem, 'id' | 'lastUpdated'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if item already exists by recNumAndPort
  const existing = await db.select().from(foodItems).where(eq(foodItems.recNumAndPort, item.recNumAndPort)).limit(1);
  
  if (existing.length > 0) {
    await db.update(foodItems).set({ ...item, lastUpdated: new Date() }).where(eq(foodItems.recNumAndPort, item.recNumAndPort));
  } else {
    await db.insert(foodItems).values(item);
  }
}

export async function createFoodItem(input: {
  userId: number;
  name: string;
  diningHall: string;
  servingSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  station?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const station = input.station?.trim() || "User Added";
  const name = input.name.trim();
  const diningHall = input.diningHall.trim();
  const servingSize = input.servingSize.trim();

  const baseSlug = slugify(`${diningHall}-${name}`) || "user-item";
  let recNumAndPort = baseSlug.slice(0, 50);
  let attempt = 1;
  while (true) {
    const existing = await db
      .select()
      .from(foodItems)
      .where(eq(foodItems.recNumAndPort, recNumAndPort))
      .limit(1);
    if (existing.length === 0) break;
    attempt += 1;
    recNumAndPort = `${baseSlug}-${attempt}`.slice(0, 50);
  }

  await db.insert(foodItems).values({
    createdByUserId: input.userId,
    name,
    diningHall,
    station,
    recNumAndPort,
    servingSize,
    calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    saturatedFat: null,
    transFat: null,
    cholesterol: null,
    sodium: null,
    fiber: null,
    sugars: null,
    ingredients: null,
    allergens: null,
  });

  const [created] = await db
    .select()
    .from(foodItems)
    .where(eq(foodItems.recNumAndPort, recNumAndPort))
    .limit(1);
  return created;
}

export async function deleteFoodItemForUser(foodItemId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(foodItems)
    .where(and(eq(foodItems.id, foodItemId), eq(foodItems.createdByUserId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return { deleted: false };
  }

  await db
    .delete(foodItems)
    .where(and(eq(foodItems.id, foodItemId), eq(foodItems.createdByUserId, userId)));

  return { deleted: true };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Tracked Meals
export async function addTrackedMeal(userId: number, foodItemId: number, mealType: string, trackedDate: Date, quantity: number = 1) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startOfDay = new Date(trackedDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(trackedDate);
  endOfDay.setHours(23, 59, 59, 999);

  const existing = await db
    .select()
    .from(trackedMeals)
    .where(
      and(
        eq(trackedMeals.userId, userId),
        eq(trackedMeals.foodItemId, foodItemId),
        eq(trackedMeals.mealType, mealType),
        gte(trackedMeals.trackedDate, startOfDay),
        lte(trackedMeals.trackedDate, endOfDay)
      )
    )
    .orderBy(desc(trackedMeals.createdAt))
    .limit(1);

  if (existing.length > 0) {
    const current = existing[0];
    await db
      .update(trackedMeals)
      .set({ quantity: current.quantity + quantity })
      .where(eq(trackedMeals.id, current.id));
    return;
  }

  await db.insert(trackedMeals).values({
    userId,
    foodItemId,
    mealType,
    trackedDate,
    quantity,
  });
}

export async function decrementTrackedMeal(mealId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(trackedMeals)
    .where(and(eq(trackedMeals.id, mealId), eq(trackedMeals.userId, userId)))
    .limit(1);

  if (existing.length === 0) return;

  const meal = existing[0];
  if (meal.quantity > 1) {
    await db
      .update(trackedMeals)
      .set({ quantity: meal.quantity - 1 })
      .where(eq(trackedMeals.id, mealId));
    return;
  }

  await db.delete(trackedMeals).where(eq(trackedMeals.id, mealId));
}

export async function getTrackedMealsByDate(userId: number, date: Date): Promise<(TrackedMeal & { foodItem: FoodItem })[]> {
  const db = await getDb();
  if (!db) return [];

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const result = await db
    .select({
      trackedMeal: trackedMeals,
      foodItem: foodItems,
    })
    .from(trackedMeals)
    .leftJoin(foodItems, eq(trackedMeals.foodItemId, foodItems.id))
    .where(
      and(
        eq(trackedMeals.userId, userId),
        gte(trackedMeals.trackedDate, startOfDay),
        lte(trackedMeals.trackedDate, endOfDay)
      )
    )
    .orderBy(desc(trackedMeals.createdAt));

  return result.map(r => ({
    ...r.trackedMeal,
    foodItem: r.foodItem!,
  }));
}

export async function getTrackedMealsHistory(userId: number, startDate: Date, endDate: Date): Promise<(TrackedMeal & { foodItem: FoodItem })[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      trackedMeal: trackedMeals,
      foodItem: foodItems,
    })
    .from(trackedMeals)
    .leftJoin(foodItems, eq(trackedMeals.foodItemId, foodItems.id))
    .where(
      and(
        eq(trackedMeals.userId, userId),
        gte(trackedMeals.trackedDate, startDate),
        lte(trackedMeals.trackedDate, endDate)
      )
    )
    .orderBy(desc(trackedMeals.trackedDate));

  return result.map(r => ({
    ...r.trackedMeal,
    foodItem: r.foodItem!,
  }));
}

export async function deleteTrackedMeal(mealId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Verify ownership before deleting
  const meal = await db.select().from(trackedMeals).where(eq(trackedMeals.id, mealId)).limit(1);
  if (meal.length === 0 || meal[0].userId !== userId) {
    throw new Error("Unauthorized");
  }

  await db.delete(trackedMeals).where(eq(trackedMeals.id, mealId));
}

// Connected Accounts
export async function upsertConnectedAccount(
  userId: number,
  platform: string,
  updates: Partial<Omit<ConnectedAccount, "id" | "userId" | "platform">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, userId), eq(connectedAccounts.platform, platform)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(connectedAccounts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(connectedAccounts.id, existing[0].id));
    return existing[0];
  }

  await db.insert(connectedAccounts).values({
    userId,
    platform,
    ...updates,
  });

  const [row] = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, userId), eq(connectedAccounts.platform, platform)))
    .orderBy(desc(connectedAccounts.createdAt))
    .limit(1);
  return row;
}

export async function listConnectedAccounts(userId: number): Promise<ConnectedAccount[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, userId))
    .orderBy(desc(connectedAccounts.createdAt));
}

export async function setConnectedAccountActive(
  userId: number,
  platform: string,
  isActive: boolean
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(connectedAccounts)
    .set({ isActive: isActive ? 1 : 0, updatedAt: new Date() })
    .where(and(eq(connectedAccounts.userId, userId), eq(connectedAccounts.platform, platform)));
}

export async function insertOrderNotification(
  userId: number,
  platform: string,
  orderId: string,
  orderData: string,
  connectedAccountId?: number | null
): Promise<{ record: OrderNotification | undefined; created: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(orderNotifications)
    .where(and(eq(orderNotifications.userId, userId), eq(orderNotifications.orderId, orderId)))
    .limit(1);
  if (existing.length > 0) {
    return { record: existing[0], created: false };
  }

  await db.insert(orderNotifications).values({
    userId,
    platform,
    orderId,
    orderData,
    connectedAccountId: connectedAccountId ?? null,
  });

  const rows = await db
    .select()
    .from(orderNotifications)
    .where(and(eq(orderNotifications.userId, userId), eq(orderNotifications.orderId, orderId)))
    .limit(1);
  return { record: rows[0], created: true };
}

export async function listOrderNotifications(userId: number, limit: number = 25): Promise<OrderNotification[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(orderNotifications)
    .where(eq(orderNotifications.userId, userId))
    .orderBy(desc(orderNotifications.createdAt))
    .limit(limit);
}
