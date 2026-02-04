import { foreignKey, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Google OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Nutrition goals per user
export const nutritionGoals = mysqlTable("nutrition_goals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  dailyCalories: int("dailyCalories").default(2000).notNull(),
  proteinPercent: int("proteinPercent").default(30).notNull(), // % of daily calories
  carbPercent: int("carbPercent").default(45).notNull(),
  fatPercent: int("fatPercent").default(25).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NutritionGoals = typeof nutritionGoals.$inferSelect;
export type InsertNutritionGoals = typeof nutritionGoals.$inferInsert;

// Food items from dining halls
export const foodItems = mysqlTable("food_items", {
  id: int("id").autoincrement().primaryKey(),
  createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  diningHall: varchar("diningHall", { length: 100 }).notNull(), // South Campus, Yahentamitsi, 251 North
  station: varchar("station", { length: 100 }).notNull(), // Broiler Works, Grill Works, etc.
  recNumAndPort: varchar("recNumAndPort", { length: 50 }).notNull(), // UMD nutrition site identifier
  servingSize: varchar("servingSize", { length: 50 }).notNull(), // e.g., "4 oz", "1 each"
  mealTypes: varchar("mealTypes", { length: 100 }).default("|Breakfast|Lunch|Dinner|").notNull(), // pipe-delimited meal types
  menuDate: timestamp("menuDate"),
  calories: int("calories").notNull(),
  protein: int("protein").notNull(), // grams
  carbs: int("carbs").notNull(),
  fat: int("fat").notNull(),
  saturatedFat: int("saturatedFat"),
  transFat: int("transFat"),
  cholesterol: int("cholesterol"),
  sodium: int("sodium"),
  fiber: int("fiber"),
  sugars: int("sugars"),
  ingredients: text("ingredients"),
  allergens: text("allergens"), // JSON array of allergen codes
  lastUpdated: timestamp("lastUpdated").defaultNow().notNull(),
});

export type FoodItem = typeof foodItems.$inferSelect;
export type InsertFoodItem = typeof foodItems.$inferInsert;

// Tracked meals per user
export const trackedMeals = mysqlTable("tracked_meals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  foodItemId: int("foodItemId").notNull().references(() => foodItems.id, { onDelete: "cascade" }),
  quantity: int("quantity").default(1).notNull(), // number of servings
  mealType: varchar("mealType", { length: 20 }).notNull(), // breakfast, lunch, dinner, snack
  trackedDate: timestamp("trackedDate").notNull(), // date the food was consumed
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TrackedMeal = typeof trackedMeals.$inferSelect;
export type InsertTrackedMeal = typeof trackedMeals.$inferInsert;

// Connected accounts for email/order integrations
export const connectedAccounts = mysqlTable("connected_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 50 }).notNull(), // gmail, doordash, ubereats, grubhub
  platformAccountId: varchar("platformAccountId", { length: 255 }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  expiresAt: timestamp("expiresAt"),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConnectedAccount = typeof connectedAccounts.$inferSelect;
export type InsertConnectedAccount = typeof connectedAccounts.$inferInsert;

export const orderNotifications = mysqlTable("order_notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectedAccountId: int("connectedAccountId").references(() => connectedAccounts.id),
  platform: varchar("platform", { length: 50 }).notNull(),
  orderId: varchar("orderId", { length: 255 }).notNull(),
  orderData: text("orderData"),
  status: varchar("status", { length: 50 }).default("pending"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OrderNotification = typeof orderNotifications.$inferSelect;
export type InsertOrderNotification = typeof orderNotifications.$inferInsert;

export const unmatchedOrderItems = mysqlTable(
  "unmatched_order_items",
  {
    id: int("id").autoincrement().primaryKey(),
    orderNotificationId: int("orderNotificationId"),
    itemName: varchar("itemName", { length: 255 }).notNull(),
    restaurant: varchar("restaurant", { length: 255 }),
    quantity: int("quantity").default(1).notNull(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    resolved: int("resolved").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    orderNotificationFk: foreignKey({
      columns: [table.orderNotificationId],
      foreignColumns: [orderNotifications.id],
      name: "uoi_order_fk",
    }),
  })
);

export type UnmatchedOrderItem = typeof unmatchedOrderItems.$inferSelect;
export type InsertUnmatchedOrderItem = typeof unmatchedOrderItems.$inferInsert;
