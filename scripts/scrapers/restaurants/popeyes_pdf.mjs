import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { and, eq } from "drizzle-orm";
import { foodItems } from "../../../drizzle/schema.ts";

const DINING_HALL_NAME = "Popeyes";
const MENU_STATION = "Popeyes Nutrition PDF";

function extractNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Math.round(value);
  const match = String(value).match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Math.round(parseFloat(match[1]));
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseLineNumbers(line) {
  const matches = line.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map((num) => extractNumber(num)).filter((num) => num !== null);
}

function parseNumericTokens(line) {
  const tokens = [];
  const regex = /\d+(?:\/\d+)?(?:\.\d+)?/g;
  let match = regex.exec(line);
  while (match) {
    tokens.push({ text: match[0], index: match.index });
    match = regex.exec(line);
  }
  return tokens;
}

function tokenToNumber(text) {
  if (!text) return null;
  if (text.includes("/")) {
    const [numerator, denominator] = text.split("/");
    if (numerator && denominator) {
      const value = Number(numerator) / Number(denominator);
      if (Number.isFinite(value)) return Math.round(value);
    }
  }
  return extractNumber(text);
}

function isHeaderLine(line) {
  const normalized = normalizeKey(line);
  return (
    normalized.includes("calories") &&
    normalized.includes("total fat") &&
    normalized.includes("protein")
  );
}

function isNutrientHeaderLine(line) {
  const normalized = normalizeKey(line);
  const keywords = [
    "calories",
    "protein",
    "carb",
    "carbohydrate",
    "fat",
    "sodium",
    "cholesterol",
    "sugar",
    "fiber",
    "saturated",
    "trans",
    "serving",
  ];
  let matches = 0;
  for (const keyword of keywords) {
    if (normalized.includes(keyword)) {
      matches += 1;
    }
  }
  if (normalized.startsWith("protein") || normalized.startsWith("calories")) {
    return true;
  }
  return matches >= 2;
}

function buildNutritionFromNumbers(numbers) {
  if (numbers.length >= 11) {
    return {
      calories: numbers[0],
      fat: numbers[2],
      saturatedFat: numbers[3],
      transFat: numbers[4],
      cholesterol: numbers[5],
      sodium: numbers[6],
      carbs: numbers[7],
      fiber: numbers[8],
      sugars: numbers[9],
      protein: numbers[10],
    };
  }
  if (numbers.length >= 10) {
    return {
      calories: numbers[0],
      fat: numbers[1],
      saturatedFat: numbers[2],
      transFat: numbers[3],
      cholesterol: numbers[4],
      sodium: numbers[5],
      carbs: numbers[6],
      fiber: numbers[7],
      sugars: numbers[8],
      protein: numbers[9],
    };
  }
  return null;
}

function parsePdfText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isHeaderLine(line) || isNutrientHeaderLine(line)) continue;

    let combined = line;
    let tokens = parseNumericTokens(combined);
    if (tokens.length === 0 && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (!isHeaderLine(nextLine) && !isNutrientHeaderLine(nextLine)) {
        const nextTokens = parseNumericTokens(nextLine);
        if (nextTokens.length >= 10) {
          combined = `${line} ${nextLine}`;
          tokens = nextTokens;
          i += 1;
        }
      }
    }

    if (tokens.length < 10) continue;
    const nutritionTokens = tokens.slice(-11);
    const caloriesToken = nutritionTokens[0];
    const prefix = combined.slice(0, caloriesToken.index).trim();
    const columns = prefix.split(/\s{2,}/).filter(Boolean);
    const namePart = columns[0]?.trim() ?? "";
    const servingSize = columns.slice(1).join(" ").trim();
    if (!namePart) continue;
    if (isNutrientHeaderLine(namePart)) continue;

    const nutritionNumbers = nutritionTokens
      .map((token) => tokenToNumber(token.text))
      .filter((value) => value !== null);
    const nutrition = buildNutritionFromNumbers(nutritionNumbers);
    if (!nutrition) continue;

    items.push({
      name: namePart,
      servingSize: servingSize || "1 serving",
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      saturatedFat: nutrition.saturatedFat ?? null,
      transFat: nutrition.transFat ?? null,
      cholesterol: nutrition.cholesterol ?? null,
      sodium: nutrition.sodium ?? null,
      fiber: nutrition.fiber ?? null,
      sugars: nutrition.sugars ?? null,
    });
  }

  return items;
}

export async function scrapePopeyesPdf({ db, pdfPath }) {
  const require = createRequire(import.meta.url);
  const pdfModule = require("pdf-parse");
  const PDFParse = pdfModule?.PDFParse;
  if (!PDFParse) {
    throw new Error("pdf-parse module did not export PDFParse");
  }
  const resolvedPath = pdfPath
    ? path.resolve(pdfPath)
    : path.resolve("scripts", "data", "popeyes_nutrition.pdf");

  if (!fs.existsSync(resolvedPath)) {
    console.warn(`Popeyes PDF not found at ${resolvedPath}`);
    return 0;
  }

  const buffer = fs.readFileSync(resolvedPath);
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  const items = parsePdfText(parsed.text);

  if (items.length === 0) {
    console.warn("No Popeyes items parsed from PDF.");
    return 0;
  }

  let totalItemsAdded = 0;
  for (const item of items) {
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
      recNumAndPort: item.name.slice(0, 50),
    });

    totalItemsAdded += 1;
  }

  console.log(`Added ${totalItemsAdded} Popeyes items from PDF.`);
  return totalItemsAdded;
}
