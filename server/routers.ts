import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";

const DEFAULT_NUTRITION_GOALS = {
  dailyCalories: 2000,
  proteinPercent: 30,
  carbPercent: 45,
  fatPercent: 25,
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { updateUserProfile } = await import("./db");
        await updateUserProfile(ctx.user.id, { name: input.name });
        return {
          ...ctx.user,
          name: input.name,
        };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  nutrition: router({
    // Get user's nutrition goals
    getGoals: protectedProcedure.query(async ({ ctx }) => {
      const { getNutritionGoals } = await import("./db");
      const goals = await getNutritionGoals(ctx.user.id);
      
      // Return existing goals or default goals
      if (goals) {
        return goals;
      }
      
      return {
        id: 0,
        userId: ctx.user.id,
        ...DEFAULT_NUTRITION_GOALS,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),

    // Update user's nutrition goals
    updateGoals: protectedProcedure
      .input(z.object({
        dailyCalories: z.number().min(1000).max(5000),
        proteinPercent: z.number().min(10).max(50),
        carbPercent: z.number().min(20).max(70),
        fatPercent: z.number().min(10).max(50),
      }))
      .mutation(async ({ ctx, input }) => {
        const { upsertNutritionGoals } = await import("./db");
        await upsertNutritionGoals(ctx.user.id, input);
        return input;
      }),

    // Get today's tracked meals
    getTodayMeals: protectedProcedure.query(async ({ ctx }) => {
      const { getTrackedMealsByDate } = await import("./db");
      const meals = await getTrackedMealsByDate(ctx.user.id, new Date());
      return meals || [];
    }),

    // Add a tracked meal
    addMeal: protectedProcedure
      .input(z.object({
        foodItemId: z.number(),
        mealType: z.string(),
        quantity: z.number().min(1).default(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const { addTrackedMeal } = await import("./db");
        await addTrackedMeal(ctx.user.id, input.foodItemId, input.mealType, new Date(), input.quantity);
        return { success: true };
      }),

    // Delete a tracked meal
    deleteMeal: protectedProcedure
      .input(z.object({
        mealId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { deleteTrackedMeal } = await import("./db");
        await deleteTrackedMeal(input.mealId, ctx.user.id);
        return { success: true };
      }),
    // Decrement a tracked meal (or delete if quantity reaches 0)
    decrementMeal: protectedProcedure
      .input(z.object({
        mealId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { decrementTrackedMeal } = await import("./db");
        await decrementTrackedMeal(input.mealId, ctx.user.id);
        return { success: true };
      }),

    // Search food items
    searchFood: protectedProcedure
      .input(z.object({
        query: z.string(),
        diningHall: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const { searchFoodItems } = await import("./db");
        const results = await searchFoodItems(input.query, input.diningHall);
        return results || [];
      }),

    // Get food items by dining hall
    getFoodsByDiningHall: protectedProcedure
      .input(z.object({
        diningHall: z.string(),
        menuDate: z.date().optional(),
        mealType: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { getFoodItemsByDiningHall } = await import("./db");
        const foods = await getFoodItemsByDiningHall(
          input.diningHall,
          ctx.user.id,
          input.menuDate,
          input.mealType
        );
        return foods || [];
      }),

    getUserCreatedFoods: protectedProcedure.query(async () => {
      const { getUserCreatedFoodItems } = await import("./db");
      const foods = await getUserCreatedFoodItems();
      return foods || [];
    }),

    // Get food item details
    getFoodDetail: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .query(async ({ input }) => {
        const { getFoodItemById } = await import("./db");
        const food = await getFoodItemById(input.id);
        return food || null;
      }),

    // Create a user-submitted food item
    createFoodItem: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          diningHall: z.string().min(1).max(100),
          servingSize: z.string().min(1).max(50),
          calories: z.number().min(0),
          protein: z.number().min(0),
          carbs: z.number().min(0),
          fat: z.number().min(0),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { createFoodItem } = await import("./db");
        return createFoodItem({ ...input, userId: ctx.user.id });
      }),

    deleteFoodItem: protectedProcedure
      .input(
        z.object({
          foodItemId: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { deleteFoodItemForUser } = await import("./db");
        return deleteFoodItemForUser(input.foodItemId, ctx.user.id);
      }),

    // Get nutrition history
    getHistory: protectedProcedure
      .input(z.object({
        startDate: z.date(),
        endDate: z.date(),
      }))
      .query(async ({ ctx, input }) => {
        const { getTrackedMealsHistory } = await import("./db");
        const history = await getTrackedMealsHistory(ctx.user.id, input.startDate, input.endDate);
        return history || [];
      }),
  }),
  orders: router({
    getConnections: protectedProcedure.query(async ({ ctx }) => {
      const { listConnectedAccounts } = await import("./db");
      return listConnectedAccounts(ctx.user.id);
    }),
    disconnectGmail: protectedProcedure.mutation(async ({ ctx }) => {
      const { setConnectedAccountActive } = await import("./db");
      await setConnectedAccountActive(ctx.user.id, "gmail", false);
      return { success: true };
    }),
    uploadReceiptPdf: protectedProcedure
      .input(
        z.object({
          fileBase64: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { addTrackedMeal, getFoodItemsByDiningHall, listAllFoodItems } = await import("./db");
        const { normalizeFoodName, normalizeFoodNameLoose, normalizeFoodNameTokenKey } = await import("./services/orderParser");
        const { parseReceiptPdfBufferWithText } = await import("./services/receiptPdf");

        const buffer = Buffer.from(input.fileBase64, "base64");
        const parsed = await parseReceiptPdfBufferWithText(buffer);
        console.log("[Orders] Receipt upload parsed items", {
          count: parsed.items.length,
          items: parsed.items.slice(0, 5),
        });
        if (parsed.items.length === 0) {
          return { matched: 0, total: 0 };
        }

        const diningHalls = Array.from(
          new Set((await listAllFoodItems()).map((item) => item.diningHall).filter(Boolean))
        );
        const lowerText = parsed.text.toLowerCase();
        const matchedHall = diningHalls.find((hall) => lowerText.includes(hall.toLowerCase())) || null;
        console.log("[Orders] Receipt upload matched hall", { matchedHall });

        const foodItems = matchedHall
          ? await getFoodItemsByDiningHall(matchedHall)
          : await listAllFoodItems();
        const normalizedFoodItems = foodItems.map((item) => ({
          item,
          normalized: normalizeFoodName(item.name),
          loose: normalizeFoodNameLoose(item.name),
          tokenKey: normalizeFoodNameTokenKey(item.name),
          numbers: extractNumbers(`${item.name} ${item.servingSize ?? ""}`),
        }));
        console.log("[Orders] Receipt upload menu pool", {
          total: normalizedFoodItems.length,
          sample: normalizedFoodItems.slice(0, 5).map((entry) => entry.item.name),
        });

        let matchedCount = 0;
        for (const item of parsed.items) {
          const normalizedOrder = normalizeFoodName(item.name);
          const orderNumbers = extractNumbers(item.name);
          const normalizedOrderLoose = normalizeFoodNameLoose(item.name);
          const normalizedOrderLooseNoClassic = normalizedOrderLoose.replace(/\bclassic\b/g, " ").replace(/\s+/g, " ").trim();
          const orderTokenKey = normalizeFoodNameTokenKey(item.name);
          const flavorTokens = extractFlavorTokens(normalizedOrder);
          let match = normalizedFoodItems.find((entry) => entry.normalized === normalizedOrder)?.item;
          if (!match) {
            const numberFiltered = orderNumbers.length > 0
              ? normalizedFoodItems.filter((entry) =>
                  orderNumbers.every((num) => entry.numbers.includes(num))
                )
              : normalizedFoodItems;
            const flavorFiltered = flavorTokens.length > 0
              ? numberFiltered.filter((entry) =>
                  flavorTokens.every((token) => entry.normalized.includes(token))
                )
              : numberFiltered;
            const searchPool = (flavorFiltered.length > 0 ? flavorFiltered : numberFiltered).length > 0
              ? (flavorFiltered.length > 0 ? flavorFiltered : numberFiltered)
              : normalizedFoodItems;
            match = searchPool.find((entry) =>
              entry.normalized.includes(normalizedOrder) ||
              normalizedOrder.includes(entry.normalized) ||
              entry.loose.includes(normalizedOrderLoose) ||
              normalizedOrderLoose.includes(entry.loose) ||
              (normalizedOrderLooseNoClassic.length > 0 &&
                (entry.loose.includes(normalizedOrderLooseNoClassic) ||
                  normalizedOrderLooseNoClassic.includes(entry.loose))) ||
              (orderTokenKey.length > 0 && entry.tokenKey === orderTokenKey)
            )?.item;
          }
          if (!match) {
            continue;
          }
          await addTrackedMeal(ctx.user.id, match.id, "Order", new Date(), item.quantity);
          matchedCount += 1;
        }

        return { matched: matchedCount, total: parsed.items.length };
      }),
    syncGmail: protectedProcedure.mutation(async ({ ctx }) => {
      console.log("[Orders] syncGmail invoked", { userId: ctx.user.id });
      const { listConnectedAccounts, insertOrderNotification, getFoodItemsByDiningHall, addTrackedMeal, upsertConnectedAccount } = await import("./db");
      const { fetchOrderEmails, refreshGmailAccessToken } = await import("./services/gmail");
      const { parseOrderEmail, normalizeFoodName, normalizeFoodNameLoose, normalizeFoodNameTokenKey } = await import("./services/orderParser");
      const connections = await listConnectedAccounts(ctx.user.id);
      console.log("[Orders] Connected accounts", {
        total: connections.length,
        platforms: connections.map((account) => account.platform),
      });
      const gmailAccount = connections.find((account) => account.platform === "gmail" && account.isActive);
      if (!gmailAccount?.accessToken) {
        console.warn("[Orders] Gmail not connected or missing token");
        throw new Error("Gmail is not connected");
      }

      console.log("[Orders] Gmail token present", {
        tokenLength: gmailAccount.accessToken.length,
        expiresAt: gmailAccount.expiresAt ?? null,
      });
      let messages = [];
      try {
        messages = await fetchOrderEmails(gmailAccount.accessToken);
        console.log(`[Orders] Gmail messages fetched: ${messages.length}`);
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401 && gmailAccount.refreshToken) {
          console.warn("[Orders] Gmail token expired. Refreshing token...");
          const refreshed = await refreshGmailAccessToken(gmailAccount.refreshToken);
          await upsertConnectedAccount(ctx.user.id, "gmail", {
            accessToken: refreshed.access_token,
            expiresAt: refreshed.expires_in
              ? new Date(Date.now() + refreshed.expires_in * 1000)
              : null,
            isActive: 1,
          });
          messages = await fetchOrderEmails(refreshed.access_token);
          console.log(`[Orders] Gmail messages fetched after refresh: ${messages.length}`);
        } else {
          console.error("[Orders] Gmail fetch failed", error);
          throw error;
        }
      }
      let added = 0;
        for (const message of messages) {
          let parsed = parseOrderEmail(
            message.subject,
            message.body || message.snippet || "",
            message.html
          );
          console.log("[Orders] Parsed email", {
            id: message.id,
            subject: message.subject,
            date: message.date,
            restaurant: parsed.restaurant,
            items: parsed.items,
          });
          if (parsed.items.length === 0 && message.html) {
            const links = [...message.html.matchAll(/href=["']([^"']+)["']/gi)]
              .map((match) => match[1])
              .slice(0, 10);
            const pdfCandidates = links.filter((link) =>
              /pdf|download|receipt/i.test(link)
            );
            console.log("[Orders] Html links", {
              id: message.id,
              linkCount: links.length,
              pdfCandidates,
            });
          }
          if (parsed.items.length === 0 && parsed.receiptPdfUrl) {
            const { parseReceiptPdfItems } = await import("./services/receiptPdf");
            let pdfItems = await parseReceiptPdfItems(parsed.receiptPdfUrl);
            if (pdfItems.length === 0 && /click\.uber\.com|uber\.com/i.test(parsed.receiptPdfUrl)) {
              if (process.env.ENABLE_UBER_BROWSER_RECEIPTS === "true") {
                const { fetchUberReceiptItems } = await import("./services/uberReceipt");
                pdfItems = await fetchUberReceiptItems(parsed.receiptPdfUrl);
              } else {
                console.warn("[Orders] Uber receipt needs browser auth. Set ENABLE_UBER_BROWSER_RECEIPTS=true.");
              }
            }
            if (pdfItems.length > 0) {
              parsed = { ...parsed, items: pdfItems };
              console.log("[Orders] Parsed PDF items", {
                orderId: message.id,
                count: pdfItems.length,
              });
            }
          }
        const orderId = message.id;
        const saved = await insertOrderNotification(
          ctx.user.id,
          "gmail",
          orderId,
          JSON.stringify({ ...message, parsed }),
          gmailAccount.id
        );
        console.log("[Orders] Order notification stored", {
          orderId,
          created: saved.created,
        });
          if (saved.record && parsed.restaurant && parsed.items.length > 0) {
            const foodItems = await getFoodItemsByDiningHall(parsed.restaurant);
            const normalizedFoodItems = foodItems.map((item) => ({
              item,
              normalized: normalizeFoodName(item.name),
              loose: normalizeFoodNameLoose(item.name),
              tokenKey: normalizeFoodNameTokenKey(item.name),
              numbers: extractNumbers(`${item.name} ${item.servingSize ?? ""}`),
            }));
            let matchedCount = 0;
            for (const item of parsed.items) {
              const normalizedOrder = normalizeFoodName(item.name);
              const orderNumbers = extractNumbers(item.name);
              const normalizedOrderLoose = normalizeFoodNameLoose(item.name);
              const normalizedOrderLooseNoClassic = normalizedOrderLoose.replace(/\bclassic\b/g, " ").replace(/\s+/g, " ").trim();
              const orderTokenKey = normalizeFoodNameTokenKey(item.name);
              const flavorTokens = extractFlavorTokens(normalizedOrder);
              let match = normalizedFoodItems.find((entry) => entry.normalized === normalizedOrder)?.item;
              if (!match) {
                const numberFiltered = orderNumbers.length > 0
                  ? normalizedFoodItems.filter((entry) =>
                      orderNumbers.every((num) => entry.numbers.includes(num))
                    )
                  : normalizedFoodItems;
                const flavorFiltered = flavorTokens.length > 0
                  ? numberFiltered.filter((entry) =>
                      flavorTokens.every((token) => entry.normalized.includes(token))
                    )
                  : numberFiltered;
                const searchPool = (flavorFiltered.length > 0 ? flavorFiltered : numberFiltered).length > 0
                  ? (flavorFiltered.length > 0 ? flavorFiltered : numberFiltered)
                  : normalizedFoodItems;
                match = searchPool.find((entry) =>
                  entry.normalized.includes(normalizedOrder) ||
                  normalizedOrder.includes(entry.normalized) ||
                  entry.loose.includes(normalizedOrderLoose) ||
                  normalizedOrderLoose.includes(entry.loose) ||
                  (normalizedOrderLooseNoClassic.length > 0 &&
                    (entry.loose.includes(normalizedOrderLooseNoClassic) ||
                      normalizedOrderLooseNoClassic.includes(entry.loose))) ||
                  (orderTokenKey.length > 0 && entry.tokenKey === orderTokenKey)
                )?.item;
              }
              if (!match) {
                console.log(`[Orders] No match for order item "${item.name}" in ${parsed.restaurant}`);
                continue;
              }
            await addTrackedMeal(ctx.user.id, match.id, "Order", new Date(), item.quantity);
            matchedCount += 1;
          }
          console.log(`[Orders] Matched ${matchedCount}/${parsed.items.length} items for ${parsed.restaurant}`);
        } else {
          console.log(`[Orders] Parsed order missing items or restaurant for message ${message.id}`);
        }
        if (saved.created) added += 1;
      }

      return { added };
    }),
    getOrderNotifications: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).optional() }))
      .query(async ({ ctx, input }) => {
        const { listOrderNotifications } = await import("./db");
        return listOrderNotifications(ctx.user.id, input.limit ?? 25);
      }),
  }),
});

export type AppRouter = typeof appRouter;

function extractNumbers(value: string) {
  const matches = value.match(/\d+/g);
  if (!matches) return [];
  return matches.map((num) => Number(num)).filter((num) => Number.isFinite(num));
}

function extractFlavorTokens(value: string) {
  const flavorWords = new Set([
    "sweet",
    "spicy",
    "bbq",
    "buffalo",
    "garlic",
    "honey",
    "lemon",
    "pepper",
    "signature",
    "ranch",
    "parmesan",
    "cajun",
    "mild",
    "hot",
  ]);
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && flavorWords.has(token));
}
