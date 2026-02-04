import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { createRequire } from "module";
import { and, eq } from "drizzle-orm";
import { foodItems } from "../../../drizzle/schema.ts";

const DINING_HALL_NAME = "Chipotle";
const MENU_STATION = "Chipotle Menu";
const CHIPOTLE_PDF_ENV = "CHIPOTLE_PDF_PATH";
const DEFAULT_PDF_NAME = "chipotleNutrition.pdf";

const OFFICIAL_MENU_URLS = [
  "https://www.chipotle.com/content/dam/poc/order/nutrition.json",
  "https://www.chipotle.com/content/dam/poc/order/menu.json",
  "https://services.chipotle.com/menu/v1/menu",
  "https://services.chipotle.com/menu/v2/menu",
];

const NUTRITIONIX_MENU_URL = "https://www.nutritionix.com/chipotle/menu/premium?desktop";

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

function parseNumericTokens(line) {
  const tokens = [];
  const regex = /-?\d+(?:\.\d+)?/g;
  let match = regex.exec(line);
  while (match) {
    tokens.push({ text: match[0], index: match.index });
    match = regex.exec(line);
  }
  return tokens;
}

function buildNutritionFromNumbers(numbers) {
  if (numbers.length < 11) return null;
  const slice = numbers.slice(-11);
  return {
    calories: slice[0],
    fat: slice[2],
    saturatedFat: slice[3],
    transFat: slice[4],
    cholesterol: slice[5],
    sodium: slice[6],
    carbs: slice[7],
    fiber: slice[8],
    sugars: slice[9],
    protein: slice[10],
  };
}

function isChipotleHeaderLine(line) {
  const normalized = normalizeKey(line);
  return (
    normalized.includes("nutritionfacts") ||
    (normalized.includes("calories") && normalized.includes("protein"))
  );
}

function parseChipotlePdfText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let startIndex = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (isChipotleHeaderLine(lines[i])) {
      startIndex = i + 1;
      break;
    }
  }

  const items = [];
  const seen = new Set();
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];
    if (isChipotleHeaderLine(line)) continue;

    let combined = line;
    let tokens = parseNumericTokens(combined);
    if (tokens.length < 11 && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (!isChipotleHeaderLine(nextLine)) {
        const nextTokens = parseNumericTokens(nextLine);
        if (nextTokens.length + tokens.length >= 11) {
          combined = `${line} ${nextLine}`;
          tokens = parseNumericTokens(combined);
          i += 1;
        }
      }
    }

    if (tokens.length < 11) continue;
    const macroToken = tokens[tokens.length - 11];
    const namePart = combined.slice(0, macroToken.index).trim();
    if (!namePart || isChipotleHeaderLine(namePart)) continue;

    const numbers = tokens
      .map((token) => extractNumber(token.text))
      .filter((value) => value !== null);
    const nutrition = buildNutritionFromNumbers(numbers);
    if (!nutrition?.calories) continue;

    const key = normalizeKey(namePart);
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      name: namePart,
      servingSize: "1 serving",
      calories: nutrition.calories,
      protein: nutrition.protein ?? 0,
      carbs: nutrition.carbs ?? 0,
      fat: nutrition.fat ?? 0,
      saturatedFat: nutrition.saturatedFat ?? null,
      transFat: nutrition.transFat ?? null,
      cholesterol: nutrition.cholesterol ?? null,
      sodium: nutrition.sodium ?? null,
      fiber: nutrition.fiber ?? null,
      sugars: nutrition.sugars ?? null,
      itemId: null,
    });
  }

  return items;
}

async function parseChipotlePdf(pdfPath) {
  const require = createRequire(import.meta.url);
  const pdfModule = require("pdf-parse");
  const PDFParse = pdfModule?.PDFParse;
  if (!PDFParse) {
    throw new Error("pdf-parse module did not export PDFParse");
  }
  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  return parseChipotlePdfText(parsed.text || "");
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
  const serving = String(node.servingSize ?? node.serving_size ?? "").trim();
  if (serving) return serving;
  return "1 serving";
}

function extractNutrition(node) {
  if (!node || typeof node !== "object") return null;
  const nutrition =
    node.nutrition ||
    node.nutritionInfo ||
    node.nutritionalInfo ||
    node.nutritionalInformation ||
    node.nutrients ||
    node.nutritionFacts ||
    node.nutrition_facts ||
    null;
  const calories =
    getNumberFromObject(node, ["calories", "energy", "kcal", "calories_kcal"]) ??
    getNumberFromObject(nutrition, ["calories", "energy", "kcal", "calories_kcal"]);
  const protein =
    getNumberFromObject(node, ["protein", "protein_g", "proteinGrams"]) ??
    getNumberFromObject(nutrition, ["protein", "protein_g", "proteinGrams"]);
  const carbs =
    getNumberFromObject(node, ["carbs", "carbohydrates", "carbohydrate", "total_carbohydrate"]) ??
    getNumberFromObject(nutrition, [
      "carbs",
      "carbohydrates",
      "carbohydrate",
      "total_carbohydrate",
    ]);
  const fat =
    getNumberFromObject(node, ["fat", "total_fat", "totalfat", "total_fat_g"]) ??
    getNumberFromObject(nutrition, ["fat", "total_fat", "totalfat", "total_fat_g"]);

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

function hasRequiredMacros(nutrition) {
  return (
    nutrition?.calories != null &&
    nutrition?.protein != null &&
    nutrition?.carbs != null &&
    nutrition?.fat != null
  );
}

function extractItemsFromPayload(payload) {
  const items = [];
  const seen = new Set();
  const nameKeys = ["name", "item_name", "itemName", "displayName", "title"];
  const stack = [payload];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (Array.isArray(current)) {
      current.forEach((entry) => stack.push(entry));
      continue;
    }
    if (typeof current === "object") {
      const name = nameKeys.map((key) => current[key]).find((value) => !!value) || null;
      const nutrition = extractNutrition(current);
      if (typeof name === "string" && name.trim() && hasRequiredMacros(nutrition)) {
        const id = current.id || current.itemId || current.item_id || current.nutritionId || null;
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

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
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

async function fetchNutritionixFallback() {
  try {
    const response = await fetch(NUTRITIONIX_MENU_URL);
    if (!response.ok) return [];
    const html = await response.text();
    const $ = cheerio.load(html);
    const nextData = extractNextData($.html());
    if (nextData) {
      return extractItemsFromPayload(nextData);
    }
    const preloaded = extractPreloadedState($.html());
    if (preloaded) {
      return extractItemsFromPayload(preloaded);
    }
  } catch {
    return [];
  }
  return [];
}

export async function scrapeChipotle({ db }) {
  console.log("Fetching Chipotle menu...");

  let items = [];
  let source = null;
  const explicitPdfPath = process.env[CHIPOTLE_PDF_ENV];
  const localPdfPath = path.resolve("scripts", "data", DEFAULT_PDF_NAME);
  const fallbackPdfPath = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, "Downloads", DEFAULT_PDF_NAME)
    : null;
  const pdfPath = [explicitPdfPath, localPdfPath, fallbackPdfPath]
    .filter(Boolean)
    .find((candidate) => fs.existsSync(candidate));

  if (pdfPath) {
    try {
      const parsedItems = await parseChipotlePdf(pdfPath);
      if (parsedItems.length > 0) {
        items = parsedItems;
        source = pdfPath;
        console.log(`Chipotle items loaded from PDF: ${source}`);
      } else {
        console.warn("No Chipotle items parsed from PDF.");
      }
    } catch (error) {
      console.warn("Failed to parse Chipotle PDF:", error?.message || error);
    }
  }

  if (items.length === 0) {
  for (const url of OFFICIAL_MENU_URLS) {
    const payload = await fetchJson(url);
    if (!payload) continue;
    const extracted = extractItemsFromPayload(payload);
    if (extracted.length > 0) {
      items = extracted;
      source = url;
      break;
    }
  }
  }

  if (items.length === 0) {
    const fallback = await fetchNutritionixFallback();
    if (fallback.length > 0) {
      items = fallback;
      source = NUTRITIONIX_MENU_URL;
    }
  }

  if (items.length === 0) {
    console.warn("No Chipotle items with nutrition found.");
    return 0;
  }

  console.log(`Chipotle items loaded from ${source}.`);
  let totalItemsAdded = 0;
  for (const item of items) {
    const existing = await db
      .select()
      .from(foodItems)
      .where(and(eq(foodItems.name, item.name), eq(foodItems.diningHall, DINING_HALL_NAME)))
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
      saturatedFat: item.saturatedFat ?? null,
      transFat: item.transFat ?? null,
      cholesterol: item.cholesterol ?? null,
      sodium: item.sodium ?? null,
      fiber: item.fiber ?? null,
      sugars: item.sugars ?? null,
      ingredients: null,
      allergens: null,
      diningHall: DINING_HALL_NAME,
      station: MENU_STATION,
      recNumAndPort: item.itemId ? `chipotle-${item.itemId}` : item.name.slice(0, 50),
    });

    totalItemsAdded += 1;
  }

  console.log(`Added ${totalItemsAdded} Chipotle items.`);
  return totalItemsAdded;
}
