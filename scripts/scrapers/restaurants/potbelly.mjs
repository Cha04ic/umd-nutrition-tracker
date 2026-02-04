import * as cheerio from "cheerio";
import { and, eq } from "drizzle-orm";
import { foodItems } from "../../../drizzle/schema.ts";

const MENU_URLS = [
  "https://www.potbelly.com/menu/for-you",
  "https://www.nutritionix.com/potbelly/menu/premium?desktop",
];
const POTBELLY_MENU_API =
  "https://api.prod.potbelly.com/v1.1/restaurants/160738/menu?content=web";
const DINING_HALL_NAME = "Potbelly";
const MENU_STATION = "Nutritionix Menu";
const POTBELLY_PDF_ITEMS = [
  { name: "Prime Rib Steak", calories: 775 },
  { name: "Cubano", calories: 663 },
  { name: "Sweet Heat Pork BBQ", calories: 753 },
  { name: "A Wreck", calories: 774 },
  { name: "Italian", calories: 774 },
  { name: "Avo Turkey", calories: 642 },
  { name: "Chicken Club", calories: 690 },
  { name: "BLTA", calories: 612 },
  { name: "Veggie Melt", calories: 465 },
  { name: "Pizza Melt", calories: 625 },
  { name: "Mediterranean", calories: 621 },
  { name: "Mamas Meatball", calories: 727 },
  { name: "Turkey Breast", calories: 638 },
  { name: "Smoked Ham", calories: 772 },
  { name: "Roast Beef", calories: 614 },
  { name: "Grilled Chicken", calories: 573 },
  { name: "Tuna Salad", calories: 685 },
  { name: "Chicken Salad", calories: 761 },
  { name: "PB&J", calories: 605 },
  { name: "Grilled Cheese", calories: 420 },
  { name: "Farmhouse Salad", calories: 425 },
  { name: "Apple Walnut Salad", calories: 687 },
  { name: "Powerhouse Salad", calories: 324 },
  { name: "Chicken Salad Salad", calories: 523 },
  { name: "Chili Mac", calories: 300 },
  { name: "Mac & Cheese", calories: 297 },
  { name: "Broccoli Cheddar", calories: 233 },
  { name: "Chili", calories: 247 },
  { name: "Garden Vegetable", calories: 73 },
  { name: "Loaded Baked Potato", calories: 207 },
  { name: "Coke (20 oz)", calories: 240 },
  { name: "Sprite (20 oz)", calories: 240 },
  { name: "Bottled Water", calories: 0 },
  { name: "IBC Cream Soda", calories: 180 },
  { name: "IBC Root Beer", calories: 160 },
  { name: "San Pellegrino", calories: 130 },
  { name: "Gold Peak Sweet Tea", calories: 190 },
  { name: "Arizona Tea", calories: 225 },
  { name: "Snapple Peach Tea", calories: 160 },
  { name: "Nantucket Nectars Orange Mango", calories: 220 },
  { name: "Root Beer Float Shake", calories: 710 },
  { name: "Banana Pudding Shake", calories: 710 },
  { name: "Cold Brew Shake", calories: 770 },
  { name: "OREO Cookie Shake", calories: 769 },
  { name: "Chocolate Shake", calories: 775 },
  { name: "Strawberry Shake", calories: 745 },
  { name: "Vanilla Shake", calories: 686 },
];

function extractNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Math.round(value);
  const match = String(value).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Math.round(parseFloat(match[1]));
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getNumberFromObject(obj, keys) {
  if (!obj || typeof obj !== "object") return null;
  const keySet = new Set(keys.map((key) => normalizeKey(key)));
  for (const [rawKey, rawValue] of Object.entries(obj)) {
    const normalized = normalizeKey(rawKey);
    if (keySet.has(normalized)) {
      const parsed = extractNumber(rawValue);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function getNumberFromNutrientArray(list, keys) {
  if (!Array.isArray(list)) return null;
  const keySet = new Set(keys.map((key) => normalizeKey(key)));
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const label = normalizeKey(
      entry.name ||
        entry.label ||
        entry.nutrient ||
        entry.nutrientName ||
        entry.nutrient_name ||
        entry.displayName ||
        entry.key
    );
    if (!label) continue;
    if (keySet.has(label) || Array.from(keySet).some((key) => label.includes(key))) {
      const parsed = extractNumber(entry.value || entry.amount || entry.quantity);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function buildServingSize(node) {
  const qty = extractNumber(node.serving_qty ?? node.servingQty ?? node.servingSizeQty);
  const unit = String(node.serving_unit ?? node.servingUnit ?? "").trim();
  if (qty && unit) return `${qty} ${unit}`;
  if (qty) return `${qty} serving`;
  const grams = extractNumber(node.serving_weight_grams ?? node.servingWeightGrams);
  if (grams) return `${grams} g`;
  return "1 serving";
}

function extractNutrition(node) {
  if (!node || typeof node !== "object") return null;
  const nutrition =
    node.nutrition ||
    node.nutritionalInfo ||
    node.nutritionInfo ||
    node.nutrients ||
    node.nutritionalInformation ||
    node.nutritionFacts ||
    node.nutrition_facts ||
    node.nutritionData ||
    node.nutrition_details ||
    null;
  const calories =
    getNumberFromObject(node, ["nf_calories", "calories", "energy", "kcal", "calories_kcal"]) ??
    getNumberFromObject(nutrition, ["calories", "energy", "kcal", "calories_kcal"]);
  const protein =
    getNumberFromObject(node, ["nf_protein", "protein", "protein_g", "proteinGrams"]) ??
    getNumberFromObject(nutrition, ["protein", "protein_g", "proteinGrams"]);
  const carbs =
    getNumberFromObject(node, ["nf_total_carbohydrate", "carbs", "carbohydrates", "carbohydrate"]) ??
    getNumberFromObject(nutrition, [
      "carbs",
      "carbohydrates",
      "carbohydrate",
      "carbohydrates_g",
      "total_carbohydrate_g",
    ]);
  const fat =
    getNumberFromObject(node, ["nf_total_fat", "fat", "totalfat", "total_fat", "total_fat_g"]) ??
    getNumberFromObject(nutrition, ["fat", "totalfat", "total_fat", "total_fat_g"]);
  const nutritionArray = Array.isArray(nutrition)
    ? nutrition
    : Array.isArray(nutrition?.nutrients)
      ? nutrition.nutrients
      : Array.isArray(nutrition?.items)
        ? nutrition.items
        : null;
  const arrayCalories = getNumberFromNutrientArray(nutritionArray, ["calories"]);
  const arrayProtein = getNumberFromNutrientArray(nutritionArray, ["protein"]);
  const arrayCarbs = getNumberFromNutrientArray(nutritionArray, ["carbohydrate", "carbs"]);
  const arrayFat = getNumberFromNutrientArray(nutritionArray, ["fat", "totalfat"]);

  return {
    calories: calories ?? arrayCalories,
    protein: protein ?? arrayProtein,
    carbs: carbs ?? arrayCarbs,
    fat: fat ?? arrayFat,
  };
}

function extractCaloriesOnly(node) {
  if (!node || typeof node !== "object") return null;
  const calories =
    extractNumber(node.basecalories) ??
    extractNumber(node.maxcalories) ??
    extractNumber(node.calories);
  if (calories === null || calories === undefined) return null;
  return { calories };
}

function hasNutrition(node) {
  if (!node || typeof node !== "object") return false;
  const nutrition = extractNutrition(node);
  return (
    nutrition?.calories !== null &&
    nutrition?.calories !== undefined &&
    nutrition?.protein !== null &&
    nutrition?.protein !== undefined &&
    nutrition?.carbs !== null &&
    nutrition?.carbs !== undefined &&
    nutrition?.fat !== null &&
    nutrition?.fat !== undefined
  );
}

function extractItemsFromNutritionixData(data) {
  const items = [];
  const seen = new Set();
  const nameKeys = ["food_name", "item_name", "itemName", "name", "displayName", "title"];
  const stack = [data];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (Array.isArray(current)) {
      current.forEach((entry) => stack.push(entry));
      continue;
    }
    if (typeof current === "object") {
      const name = nameKeys.map((key) => current[key]).find((value) => !!value) || null;
      if (typeof name === "string" && name.trim() && hasNutrition(current)) {
        const nutrition = extractNutrition(current);
        if (!nutrition) {
          Object.values(current).forEach((entry) => stack.push(entry));
          continue;
        }
        const id =
          current.nix_item_id ||
          current.nixItemId ||
          current.item_id ||
          current.itemId ||
          null;
        const key = `${normalizeKey(name)}:${id ?? ""}`;
        if (!seen.has(key)) {
          items.push({
            name: name.trim(),
            calories: nutrition.calories,
            protein: nutrition.protein,
            carbs: nutrition.carbs,
            fat: nutrition.fat,
            servingSize: buildServingSize(current),
            itemId: id ? String(id) : null,
          });
          seen.add(key);
        }
      }
      Object.values(current).forEach((entry) => stack.push(entry));
    }
  }

  return items;
}

function extractItemsFromPotbellyMenu(data) {
  const items = [];
  const seen = new Set();
  const stack = [data];
  const nameKeys = ["name", "item_name", "itemName", "displayName", "title"];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (Array.isArray(current)) {
      current.forEach((entry) => stack.push(entry));
      continue;
    }
    if (typeof current === "object") {
      const name = nameKeys.map((key) => current[key]).find((value) => !!value) || null;
      const caloriesOnly = extractCaloriesOnly(current);
      if (typeof name === "string" && name.trim() && caloriesOnly) {
        const id = current.chainproductid || current.chainProductId || current.id || null;
        const key = `${normalizeKey(name)}:${id ?? ""}`;
        if (!seen.has(key)) {
          items.push({
            name: name.trim(),
            calories: caloriesOnly.calories,
            protein: 0,
            carbs: 0,
            fat: 0,
            servingSize: "1 serving",
            itemId: id ? String(id) : null,
          });
          seen.add(key);
        }
      }
      Object.values(current).forEach((entry) => stack.push(entry));
    }
  }

  return items;
}

function collectSampleNodes(data, limit = 3) {
  const samples = [];
  const stack = [data];
  const nameKeys = ["name", "item_name", "itemName", "displayName", "title"];
  while (stack.length > 0 && samples.length < limit) {
    const current = stack.pop();
    if (!current) continue;
    if (Array.isArray(current)) {
      current.forEach((entry) => stack.push(entry));
      continue;
    }
    if (typeof current === "object") {
      const name = nameKeys.map((key) => current[key]).find((value) => !!value);
      if (typeof name === "string" && name.trim()) {
        const nutrition =
          current.nutrition ||
          current.nutritionFacts ||
          current.nutrition_facts ||
          current.nutrients ||
          null;
        samples.push({
          name: name.trim(),
          keys: Object.keys(current).slice(0, 12),
          nutritionKeys: nutrition ? Object.keys(nutrition).slice(0, 12) : [],
        });
      }
      Object.values(current).forEach((entry) => stack.push(entry));
    }
  }
  return samples;
}

function extractNextData(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractPreloadedState(html) {
  const match = html.match(/__PRELOADED_STATE__\s*=\s*({.*?})\s*;/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractItemsFromNutritionixHtml(html) {
  const items = [];
  const seen = new Set();
  const $ = cheerio.load(html);
  const tables = $("table");

  const normalizeHeader = (value) => normalizeKey(value).replace(/fromfat/g, "");

  const findHeaderIndex = (headers, matchers, { allowContains } = { allowContains: true }) => {
    for (const matcher of matchers) {
      const idx = headers.indexOf(matcher);
      if (idx !== -1) return idx;
    }
    if (!allowContains) return -1;
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i];
      if (matchers.some((matcher) => header.includes(matcher))) {
        return i;
      }
    }
    return -1;
  };

  tables.each((_, table) => {
    const headerCells = $(table).find("thead th, thead td").length
      ? $(table).find("thead th, thead td")
      : $(table).find("tr").first().find("th, td");
    const rawHeaders = headerCells
      .map((__, cell) => $(cell).text().trim())
      .get()
      .filter((value) => value.length > 0);
    if (rawHeaders.length < 2) return;

    const headers = rawHeaders.map((value) => normalizeHeader(value));
    const nameIdx =
      findHeaderIndex(headers, ["item", "menuitem", "name"], { allowContains: true }) ?? -1;
    let caloriesIdx = findHeaderIndex(headers, ["calories", "cal", "kcal"], {
      allowContains: false,
    });
    if (caloriesIdx === -1) {
      caloriesIdx = headers.findIndex(
        (value) => value.includes("calories") && !value.includes("fromfat")
      );
    }
    if (nameIdx === -1 || caloriesIdx === -1) return;

    const fatIdx = findHeaderIndex(headers, ["totalfat", "fat"], { allowContains: true });
    const carbsIdx = findHeaderIndex(headers, ["totalcarb", "carbohydrate", "carbs"], {
      allowContains: true,
    });
    const proteinIdx = findHeaderIndex(headers, ["protein"], { allowContains: true });

    const rowSelector = $(table).find("tbody tr").length ? "tbody tr" : "tr";
    $(table)
      .find(rowSelector)
      .slice(1)
      .each((__, row) => {
        const cells = $(row).find("td");
        if (cells.length <= Math.max(nameIdx, caloriesIdx)) return;
        const name = $(cells[nameIdx]).text().trim();
        if (!name || /calories|nutrition/i.test(name)) return;
        const calories = extractNumber($(cells[caloriesIdx]).text());
        if (calories === null) return;
        const fat = fatIdx !== -1 ? extractNumber($(cells[fatIdx]).text()) : 0;
        const carbs = carbsIdx !== -1 ? extractNumber($(cells[carbsIdx]).text()) : 0;
        const protein = proteinIdx !== -1 ? extractNumber($(cells[proteinIdx]).text()) : 0;
        const key = normalizeKey(name);
        if (seen.has(key)) return;
        items.push({
          name,
          calories,
          protein: protein ?? 0,
          carbs: carbs ?? 0,
          fat: fat ?? 0,
          servingSize: "1 serving",
          itemId: null,
        });
        seen.add(key);
      });
  });

  return items;
}

async function fetchRenderedHtml(url, pageInstance) {
  try {
    await pageInstance.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await pageInstance.waitForTimeout(2000);
    return await pageInstance.content();
  } catch (error) {
    console.warn(`Failed to render Potbelly menu page: ${url}`, error);
    return null;
  }
}

async function readWindowData(pageInstance) {
  try {
    return await pageInstance.evaluate(() => {
      return {
        nextData: window.__NEXT_DATA__ ?? null,
        nuxt: window.__NUXT__ ?? null,
        apollo: window.__APOLLO_STATE__ ?? null,
        initialState: window.__INITIAL_STATE__ ?? null,
      };
    });
  } catch {
    return null;
  }
}

async function fetchPotbellyMenuApi() {
  try {
    const response = await fetch(POTBELLY_MENU_API, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function scrapePotbelly({ db }) {
  const apiPayload = await fetchPotbellyMenuApi();
  if (apiPayload) {
    const apiItems = extractItemsFromPotbellyMenu(apiPayload.menu ?? apiPayload);
    if (apiItems.length > 0) {
      let totalItemsAdded = 0;
      for (const item of apiItems) {
        const existing = await db
          .select()
          .from(foodItems)
          .where(
            and(eq(foodItems.name, item.name), eq(foodItems.diningHall, DINING_HALL_NAME))
          )
          .limit(1);

        if (existing.length > 0) {
          continue;
        }

        await db.insert(foodItems).values({
          name: item.name,
          servingSize: item.servingSize || "1 serving",
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          saturatedFat: null,
          transFat: null,
          cholesterol: null,
          sodium: null,
          fiber: null,
          sugars: null,
          ingredients: null,
          allergens: null,
          diningHall: DINING_HALL_NAME,
          station: MENU_STATION,
          recNumAndPort: item.itemId ? `potbelly-${item.itemId}` : item.name.slice(0, 50),
        });

        totalItemsAdded += 1;
      }

      console.log(`Added ${totalItemsAdded} Potbelly items.`);
      return totalItemsAdded;
    }
  }

  if (POTBELLY_PDF_ITEMS.length > 0) {
    let totalItemsAdded = 0;
    for (const item of POTBELLY_PDF_ITEMS) {
      const existing = await db
        .select()
        .from(foodItems)
        .where(
          and(eq(foodItems.name, item.name), eq(foodItems.diningHall, DINING_HALL_NAME))
        )
        .limit(1);

      if (existing.length > 0) {
        continue;
      }

      await db.insert(foodItems).values({
        name: item.name,
        servingSize: "1 serving",
        calories: item.calories,
        protein: 0,
        carbs: 0,
        fat: 0,
        saturatedFat: null,
        transFat: null,
        cholesterol: null,
        sodium: null,
        fiber: null,
        sugars: null,
        ingredients: null,
        allergens: null,
        diningHall: DINING_HALL_NAME,
        station: "Potbelly Menu PDF",
        recNumAndPort: `potbelly-pdf-${normalizeKey(item.name)}`.slice(0, 50),
      });

      totalItemsAdded += 1;
    }

    console.log(`Added ${totalItemsAdded} Potbelly items from PDF list.`);
    return totalItemsAdded;
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    console.error("Playwright is not installed. Run: npm install -D playwright");
    console.error(error);
    return 0;
  }

  const headless = String(process.env.HEADLESS || "true").toLowerCase() !== "false";
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120000);

  const networkPayloads = [];
  const responseHandler = async (response) => {
    try {
      const url = response.url();
      const contentType = response.headers()["content-type"] || "";
      if (!contentType.includes("application/json")) return;
      if (networkPayloads.length >= 40) return;
      const data = await response.json();
      if (data) {
        const keys = Object.keys(data);
        if (keys.length > 0) {
          console.log("[Potbelly] JSON response", {
            url,
            keys: keys.slice(0, 12),
          });
        }
        networkPayloads.push(data);
      }
    } catch {
      return;
    }
  };

  page.on("response", responseHandler);
  let menuItems = [];
  let sourceUrl = null;

  for (const menuUrl of MENU_URLS) {
    const html = await fetchRenderedHtml(menuUrl, page);
    page.off("response", responseHandler);
    if (!html) {
      page.on("response", responseHandler);
      continue;
    }

    const $ = cheerio.load(html);
    menuItems = [];
    const nutritionixHtmlItems = extractItemsFromNutritionixHtml($.html());
    nutritionixHtmlItems.forEach((item) => menuItems.push(item));
    for (const payload of networkPayloads) {
      const items = extractItemsFromNutritionixData(payload);
      items.forEach((item) => menuItems.push(item));
    }
    if (menuItems.length === 0) {
      const menuPayload = networkPayloads.find((payload) => payload?.menu);
      if (menuPayload) {
        const samples = collectSampleNodes(menuPayload.menu);
        if (samples.length > 0) {
          console.log("[Potbelly] Menu samples", samples);
        }
        const items = extractItemsFromPotbellyMenu(menuPayload.menu);
        items.forEach((item) => menuItems.push(item));
      }
    }
    const windowData = await readWindowData(page);
    if (windowData) {
      const candidates = [
        windowData.nextData,
        windowData.nuxt,
        windowData.apollo,
        windowData.initialState,
      ];
      for (const candidate of candidates) {
        if (!candidate) continue;
        const items = extractItemsFromNutritionixData(candidate);
        items.forEach((item) => menuItems.push(item));
      }
    }
    if (menuItems.length === 0) {
      const nextData = extractNextData($.html());
      if (nextData) {
        menuItems = extractItemsFromNutritionixData(nextData);
      }
    }
    if (menuItems.length === 0) {
      const preloaded = extractPreloadedState($.html());
      if (preloaded) {
        menuItems = extractItemsFromNutritionixData(preloaded);
      }
    }
    if (menuItems.length > 0) {
      sourceUrl = menuUrl;
      break;
    }
    page.on("response", responseHandler);
  }

  if (menuItems.length === 0) {
    console.warn("No Potbelly items with nutrition found.");
    await browser.close();
    return 0;
  }

  let totalItemsAdded = 0;
  for (const item of menuItems) {
    const existing = await db
      .select()
      .from(foodItems)
      .where(
        and(eq(foodItems.name, item.name), eq(foodItems.diningHall, DINING_HALL_NAME))
      )
      .limit(1);

    if (existing.length > 0) {
      continue;
    }

    await db.insert(foodItems).values({
      name: item.name,
      servingSize: item.servingSize || "1 serving",
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      saturatedFat: null,
      transFat: null,
      cholesterol: null,
      sodium: null,
      fiber: null,
      sugars: null,
      ingredients: null,
      allergens: null,
      diningHall: DINING_HALL_NAME,
      station: MENU_STATION,
      recNumAndPort: item.itemId ? `potbelly-${item.itemId}` : item.name.slice(0, 50),
    });

    totalItemsAdded += 1;
  }

  await browser.close();
  console.log(`Added ${totalItemsAdded} Potbelly items.`);
  return totalItemsAdded;
}
