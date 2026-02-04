import * as cheerio from "cheerio";
import { and, eq, inArray, sql } from "drizzle-orm";
import { foodItems } from "../../drizzle/schema.ts";

const BASE_URL = "https://nutrition.umd.edu";
const NBSP_REGEX = /[\u00a0\u202f\u200b\u200c\u200d\uFEFF]/g;

const cleanText = (value) =>
  `${value ?? ""}`
    .replace(NBSP_REGEX, "")
    .replace(/\s+/g, " ")
    .trim();

const cleanItemName = (value) =>
  cleanText(value).replace(/^\s*Nutrition\s*\|\s*Label\s*-\s*/i, "").trim();

const DINING_HALLS = [
  { name: "South Campus", locationNum: 16 },
  { name: "Yahentamitsi Dining Hall", locationNum: 19 },
  { name: "251 North", locationNum: 51 },
];

const MEAL_TYPES = ["Breakfast", "Brunch", "Lunch", "Dinner"];
const MEAL_TYPE_SET = new Set(MEAL_TYPES);

const normalizeMealTypes = (types) => {
  const unique = Array.from(new Set(types.filter((type) => MEAL_TYPE_SET.has(type))));
  if (unique.length === 0) {
    return "|Breakfast|Lunch|Dinner|";
  }
  return `|${unique.join("|")}|`;
};

const parseMealTypes = (value) =>
  `${value ?? ""}`
    .split("|")
    .map((type) => type.trim())
    .filter((type) => type);

async function fetchMenuForDate(diningHall, date, mealType) {
  const dateStr = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  const url = `${BASE_URL}/longmenu.aspx?locationNum=${diningHall.locationNum}&dtdate=${encodeURIComponent(dateStr)}&mealName=${mealType}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) {
      console.error(`Failed to fetch menu: ${response.statusText}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const items = [];

    $("a").each((_, elem) => {
      const $elem = $(elem);
      const href = $elem.attr("href");

      if (href && href.includes("label.aspx")) {
        const name = cleanItemName($elem.text());
        const match = href.match(/RecNumAndPort=([^&]+)/);
        if (match && name) {
          const recNumAndPort = decodeURIComponent(match[1]);
          const parentText = cleanText($elem.parent().text());
          const servingSizeMatch = parentText.match(
            /(\d+\s*(?:oz|each|slice|cup|tbsp|tsp|g|ml))/i
          );
          const servingSize = servingSizeMatch ? servingSizeMatch[1] : "1 serving";

          let station = "Unknown";
          const $section = $elem.closest("section");
          if ($section.length) {
            const sectionTitle = cleanText($section.find("h3, h4").first().text());
            if (sectionTitle) station = sectionTitle;
          }

          items.push({
            name,
            recNumAndPort,
            servingSize,
            station,
            mealType,
          });
        }
      }
    });

    return items;
  } catch (error) {
    console.error(`Error fetching menu for ${diningHall.name}:`, error);
    return [];
  }
}

async function fetchMenuFromMainSite(diningHall, date) {
  const dateStr = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  const url = `${BASE_URL}/?locationNum=${diningHall.locationNum}&dtdate=${encodeURIComponent(
    dateStr
  )}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) {
      console.error(`Failed to fetch main menu: ${response.statusText}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const items = [];

    const tabMap = new Map();
    $(".nav-tabs .nav-link").each((_, el) => {
      const label = cleanText($(el).text());
      const href = $(el).attr("href");
      if (href && href.startsWith("#") && label) {
        tabMap.set(href.slice(1), label);
      }
    });

    tabMap.forEach((mealType, paneId) => {
      const $pane = $(`#${paneId}`);
      if (!$pane.length) return;
      $pane.find(".card").each((_, card) => {
        const $card = $(card);
        const station = cleanText($card.find(".card-title").first().text()) || "Unknown";
        $card.find("a.menu-item-name").each((_, link) => {
          const $link = $(link);
          const name = cleanItemName($link.text());
          const href = $link.attr("href");
          const match = href?.match(/RecNumAndPort=([^&]+)/);
          if (!match || !name) return;
          const recNumAndPort = decodeURIComponent(match[1]);
          const rowText = cleanText($link.closest(".menu-item-row").text());
          const servingSizeMatch = rowText.match(
            /(\d+\s*(?:oz|each|slice|cup|tbsp|tsp|g|ml))/i
          );
          const servingSize = servingSizeMatch ? servingSizeMatch[1] : "1 serving";
          items.push({
            name,
            recNumAndPort,
            servingSize,
            station,
            mealType,
          });
        });
      });
    });

    return items;
  } catch (error) {
    console.error(`Error fetching main menu for ${diningHall.name}:`, error);
    return [];
  }
}

export async function fetchFoodNutrition(diningHall, date, recNumAndPort, fallbackName) {
  const dateStr = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  const url = `${BASE_URL}/label.aspx?locationNum=${diningHall.locationNum}&locationName=&dtdate=${encodeURIComponent(dateStr)}&RecNumAndPort=${encodeURIComponent(recNumAndPort)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) {
      console.error(`Failed to fetch nutrition: ${response.statusText}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const cleanedTitle = cleanItemName($("title").text());
    const cleanedH1 = cleanItemName($("h1").first().text());
    const name = cleanedH1 || cleanedTitle || cleanItemName(fallbackName) || "Unknown";

    const nutritionData = {
      name,
      servingSize: "1 serving",
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
      saturatedFat: 0,
      transFat: 0,
      cholesterol: 0,
      sodium: 0,
      fiber: 0,
      sugars: 0,
      ingredients: "",
      allergens: [],
    };

    const factsTable = $(".facts_table").first();
    const factsText = cleanText(factsTable.length ? factsTable.text() : $("body").text());

    const servingSizeValues = $(".nutfactsservsize")
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter((value) => value);
    if (servingSizeValues.length > 0) {
      nutritionData.servingSize = servingSizeValues[servingSizeValues.length - 1];
    }

    const extractNumber = (pattern) => {
      const match = factsText.match(pattern);
      if (!match) return null;
      const value = Number.parseFloat(match[1]);
      return Number.isFinite(value) ? value : null;
    };
    const calories =
      extractNumber(/Calories\s*per\s*serving\s*([0-9]+(?:\.[0-9]+)?)/i) ??
      extractNumber(/Calories\s*([0-9]+(?:\.[0-9]+)?)\s*k?cal/i) ??
      extractNumber(/Calories[^0-9]*([0-9]+(?:\.[0-9]+)?)/i);
    if (calories !== null) nutritionData.calories = Math.round(calories);

    const protein = extractNumber(/Protein[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*g/i);
    if (protein !== null) nutritionData.protein = Math.round(protein);

    const carbs = extractNumber(/Total\s*Carbohydrate\.?[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*g/i);
    if (carbs !== null) nutritionData.carbs = Math.round(carbs);

    const fat = extractNumber(/Total\s*Fat[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*g/i);
    if (fat !== null) nutritionData.fat = Math.round(fat);

    const saturatedFat = extractNumber(/Saturated Fat[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*g/i);
    if (saturatedFat !== null) nutritionData.saturatedFat = Math.round(saturatedFat);

    const transFat = extractNumber(/Trans Fat[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*g/i);
    if (transFat !== null) nutritionData.transFat = Math.round(transFat);

    const cholesterol = extractNumber(/Cholesterol[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*mg/i);
    if (cholesterol !== null) nutritionData.cholesterol = Math.round(cholesterol);

    const sodium = extractNumber(/Sodium[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*mg/i);
    if (sodium !== null) nutritionData.sodium = Math.round(sodium);

    const fiber = extractNumber(/Dietary Fiber[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*g/i);
    if (fiber !== null) nutritionData.fiber = Math.round(fiber);

    const sugars = extractNumber(/Total Sugars[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*g/i);
    if (sugars !== null) nutritionData.sugars = Math.round(sugars);

    const ingredientsValue = cleanText($(".labelingredientsvalue").text());
    if (ingredientsValue) nutritionData.ingredients = ingredientsValue;

    const allergensValue = cleanText($(".labelallergensvalue").text());
    if (allergensValue) {
      nutritionData.allergens = allergensValue
        .split(/[,;]/)
        .map((a) => a.trim())
        .filter((a) => a);
    }

    return nutritionData;
  } catch (error) {
    console.error(`Error fetching nutrition for ${recNumAndPort}:`, error);
    return null;
  }
}

export async function scrapeUmdDining({ db, date }) {
  let totalItemsAdded = 0;
  const forceStationUpdate = process.env.UMD_DINING_FORCE_STATION === "true";
  const menuDate = new Date(date);
  menuDate.setHours(0, 0, 0, 0);

  for (const diningHall of DINING_HALLS) {
    console.log(`Processing ${diningHall.name}...`);
    const itemsFromMain = await fetchMenuFromMainSite(diningHall, date);
    const itemsByMeal = new Map();
    itemsFromMain.forEach((item) => {
      const list = itemsByMeal.get(item.mealType) ?? [];
      list.push(item);
      itemsByMeal.set(item.mealType, list);
    });

    for (const [mealType, items] of itemsByMeal) {
      console.log(`  Fetching ${mealType} menu...`);
      console.log(`    Found ${items.length} items`);
      let mealAdded = 0;

      for (const item of items) {
        try {
          const existing = await db
            .select()
            .from(foodItems)
            .where(
              and(
                eq(foodItems.recNumAndPort, item.recNumAndPort),
                eq(foodItems.diningHall, diningHall.name),
                eq(foodItems.station, item.station || "Unknown"),
                sql`${foodItems.mealTypes} LIKE ${`%|${item.mealType}|%`}`,
                eq(foodItems.menuDate, menuDate)
              )
            )
            .limit(1);

          let existingRow = existing[0];
          if (!existingRow) {
            const fallback = await db
              .select()
              .from(foodItems)
              .where(
                and(
                  eq(foodItems.recNumAndPort, item.recNumAndPort),
                  eq(foodItems.diningHall, diningHall.name),
                  eq(foodItems.station, item.station || "Unknown"),
                  eq(foodItems.menuDate, null)
                )
              )
              .limit(1);
            existingRow = fallback[0];
          }
          const shouldFetchNutrition = process.env.UMD_DINING_FETCH_NUTRITION !== "false";
          if (existingRow) {
            const existingName = `${existingRow.name || ""}`;
            const badName =
              /nutrition\s*\|\s*label/i.test(existingName) ||
              /n\s*trition\s*\|\s*l\s*bel/i.test(existingName) ||
              existingName.includes("|");
            const existingMealTypes = parseMealTypes(existingRow.mealTypes);
            const nextMealTypes = existingMealTypes.includes(item.mealType)
              ? existingRow.mealTypes
              : normalizeMealTypes([...existingMealTypes, item.mealType]);
            const needsMenuFix =
              badName ||
              existingRow.servingSize !== item.servingSize ||
              nextMealTypes !== existingRow.mealTypes ||
              (forceStationUpdate && existingRow.station !== item.station);
            let didUpdate = false;

            if (needsMenuFix) {
              const stationUpdate = forceStationUpdate
                ? { station: item.station || "Unknown" }
                : {};
                await db
                  .update(foodItems)
                  .set({
                    name: item.name,
                    servingSize: item.servingSize,
                    mealTypes: nextMealTypes,
                    ...stationUpdate,
                    menuDate,
                    lastUpdated: new Date(),
                  })
                  .where(
                    and(
                      eq(foodItems.recNumAndPort, item.recNumAndPort),
                      eq(foodItems.diningHall, diningHall.name),
                      eq(foodItems.station, item.station || "Unknown"),
                      eq(foodItems.menuDate, existingRow.menuDate)
                    )
                  );
              didUpdate = true;
            }

            if (shouldFetchNutrition) {
              const nutrition = await fetchFoodNutrition(
                diningHall,
                date,
                item.recNumAndPort,
                item.name
              );
              if (nutrition) {
                const resolvedName = item.name || nutrition.name || existingRow.name;
                const allergens = nutrition.allergens?.length
                  ? JSON.stringify(nutrition.allergens)
                  : existingRow.allergens ?? null;
                const nutritionStationUpdate = forceStationUpdate
                  ? { station: item.station || "Unknown" }
                  : {};
                await db
                  .update(foodItems)
                  .set({
                    name: resolvedName,
                    servingSize: nutrition.servingSize || item.servingSize,
                    mealTypes: nextMealTypes,
                    calories: nutrition.calories ?? existingRow.calories ?? 0,
                    protein: nutrition.protein ?? existingRow.protein ?? 0,
                    carbs: nutrition.carbs ?? existingRow.carbs ?? 0,
                    fat: nutrition.fat ?? existingRow.fat ?? 0,
                    saturatedFat: nutrition.saturatedFat ?? null,
                    transFat: nutrition.transFat ?? null,
                    cholesterol: nutrition.cholesterol ?? null,
                    sodium: nutrition.sodium ?? null,
                    fiber: nutrition.fiber ?? null,
                    sugars: nutrition.sugars ?? null,
                    ingredients: nutrition.ingredients || existingRow.ingredients || null,
                    allergens,
                    diningHall: diningHall.name,
                    ...nutritionStationUpdate,
                    menuDate,
                    lastUpdated: new Date(),
                  })
                  .where(
                    and(
                      eq(foodItems.recNumAndPort, item.recNumAndPort),
                      eq(foodItems.diningHall, diningHall.name),
                      eq(foodItems.station, item.station || "Unknown"),
                      eq(foodItems.menuDate, existingRow.menuDate)
                    )
                  );
                didUpdate = true;
              }
            }

            if (didUpdate && shouldFetchNutrition) {
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
            continue;
          }

          let nutrition = null;
          if (shouldFetchNutrition) {
            nutrition = await fetchFoodNutrition(
              diningHall,
              date,
              item.recNumAndPort,
              item.name
            );
          }

          const resolvedName = item.name || nutrition?.name || "Unknown";
          const allergens = nutrition?.allergens?.length
            ? JSON.stringify(nutrition.allergens)
            : null;
          const mealTypes = normalizeMealTypes([item.mealType]);

          const values = {
            name: resolvedName,
            servingSize: nutrition?.servingSize || item.servingSize,
            mealTypes,
            menuDate,
            calories: nutrition?.calories ?? 0,
            protein: nutrition?.protein ?? 0,
            carbs: nutrition?.carbs ?? 0,
            fat: nutrition?.fat ?? 0,
            saturatedFat: nutrition?.saturatedFat ?? null,
            transFat: nutrition?.transFat ?? null,
            cholesterol: nutrition?.cholesterol ?? null,
            sodium: nutrition?.sodium ?? null,
            fiber: nutrition?.fiber ?? null,
            sugars: nutrition?.sugars ?? null,
            ingredients: nutrition?.ingredients || null,
            allergens,
            diningHall: diningHall.name,
            station: item.station || "Unknown",
            recNumAndPort: item.recNumAndPort,
            lastUpdated: new Date(),
          };

          await db.insert(foodItems).values(values);
          totalItemsAdded += 1;
          mealAdded += 1;

          if (shouldFetchNutrition) {
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        } catch (error) {
          console.error(`    Error processing ${item.name}:`, error);
        }
      }

      if (mealAdded > 0) {
        console.log(`    Added ${mealAdded} items`);
      }
    }
  }

  return totalItemsAdded;
}

export async function backfillUmdDiningNutrition({
  db,
  date,
  limit = 200,
}) {
  const hallLookup = new Map(DINING_HALLS.map((hall) => [hall.name, hall]));
  const hallNames = DINING_HALLS.map((hall) => hall.name);
  const rows = await db
    .select({
      recNumAndPort: foodItems.recNumAndPort,
      name: foodItems.name,
      diningHall: foodItems.diningHall,
      servingSize: foodItems.servingSize,
      calories: foodItems.calories,
      protein: foodItems.protein,
      carbs: foodItems.carbs,
      fat: foodItems.fat,
    })
    .from(foodItems)
    .where(and(inArray(foodItems.diningHall, hallNames), eq(foodItems.calories, 0)))
    .limit(limit);

  let updated = 0;
  for (const row of rows) {
    const hall = hallLookup.get(row.diningHall);
    if (!hall) continue;
    const nutrition = await fetchFoodNutrition(hall, date, row.recNumAndPort, row.name);
    if (!nutrition) continue;

    await db
      .update(foodItems)
      .set({
        name: row.name,
        servingSize: nutrition.servingSize || row.servingSize,
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
          eq(foodItems.diningHall, row.diningHall)
        )
      );

    updated += 1;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return { updated, scanned: rows.length };
}
