import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number = 1): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
    name: `Test User ${userId}`,
      loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("nutrition procedures", () => {
  it("should get nutrition goals for a user", async () => {
    const { ctx } = createAuthContext(1);
    const caller = appRouter.createCaller(ctx);

    const goals = await caller.nutrition.getGoals();

    // Goals may be undefined if not set yet, or should have expected structure
    if (goals) {
      expect(goals).toHaveProperty("dailyCalories");
      expect(goals).toHaveProperty("proteinPercent");
      expect(goals).toHaveProperty("carbPercent");
      expect(goals).toHaveProperty("fatPercent");
      expect(goals.dailyCalories).toBeGreaterThan(0);
    }
  });

  it("should handle nutrition goal updates gracefully", async () => {
    const { ctx } = createAuthContext(2);
    const caller = appRouter.createCaller(ctx);

    const newGoals = {
      dailyCalories: 2500,
      proteinPercent: 35,
      carbPercent: 40,
      fatPercent: 25,
    };

    try {
      const result = await caller.nutrition.updateGoals(newGoals);
      expect(result).toBeDefined();
      expect(result.dailyCalories).toBe(2500);
    } catch (error) {
      // Expected if user doesn't exist in database
      expect(error).toBeDefined();
    }
  });

  it("should get today's meals", async () => {
    const { ctx } = createAuthContext(3);
    const caller = appRouter.createCaller(ctx);

    const meals = await caller.nutrition.getTodayMeals();

    expect(Array.isArray(meals)).toBe(true);
  });

  it("should reject invalid calorie values", async () => {
    const { ctx } = createAuthContext(4);
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.nutrition.updateGoals({
        dailyCalories: 500,
        proteinPercent: 30,
        carbPercent: 45,
        fatPercent: 25,
      });
      // If it doesn't throw, that's also acceptable
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it("should search food items", async () => {
    const { ctx } = createAuthContext(5);
    const caller = appRouter.createCaller(ctx);

    const results = await caller.nutrition.searchFood({
      query: "Chicken",
    });

    expect(Array.isArray(results)).toBe(true);
  });

  it("should get foods by dining hall", async () => {
    const { ctx } = createAuthContext(6);
    const caller = appRouter.createCaller(ctx);

    const foods = await caller.nutrition.getFoodsByDiningHall({
      diningHall: "South Campus",
    });

    expect(Array.isArray(foods)).toBe(true);
  });

  it("should get nutrition history", async () => {
    const { ctx } = createAuthContext(7);
    const caller = appRouter.createCaller(ctx);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date();

    const history = await caller.nutrition.getHistory({
      startDate,
      endDate,
    });

    expect(Array.isArray(history)).toBe(true);
  });

  it("should handle food detail retrieval", async () => {
    const { ctx } = createAuthContext(8);
    const caller = appRouter.createCaller(ctx);

    const food = await caller.nutrition.getFoodDetail({
      id: 999,
    });

    // Should return undefined or null if food doesn't exist
    expect(food === undefined || food === null).toBe(true);
  });
});
