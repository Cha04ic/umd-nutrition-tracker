import * as cheerio from "cheerio";
import fs from "fs";
import { and, eq } from "drizzle-orm";
import { foodItems } from "../../../drizzle/schema.ts";

const MENU_URL = "https://www.mcdonalds.com/us/en-us/full-menu.html";
const SITEMAP_URLS = [
  "https://www.mcdonalds.com/us/en-us/sitemap.xml",
  "https://www.mcdonalds.com/sitemap.xml",
];
const DINING_HALL_NAME = "McDonald's";
const MENU_STATION = "McDonald's Menu";
let cookieAccepted = false;

function writeDebugLog(payload) {
  try {
    fs.appendFileSync(
      "c:\\Users\\renja\\OneDrive\\Documents\\CSWork\\Projects\\umd-nutrition-tracker\\.cursor\\debug.log",
      JSON.stringify(payload) + "\n",
    );
  } catch {
    // ignore logging failures
  }
}

function extractNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Math.round(value);
  const match = String(value).match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Math.round(parseFloat(match[1]));
}

function normalizeServingSize(value) {
  if (!value) return "1 serving";
  return String(value).trim();
}

function collectProductLinks($) {
  const links = new Set();
  let skippedMeals = 0;
  $("a[href]").each((_, node) => {
    const href = $(node).attr("href");
    if (!href) return;
    if (href.includes("/meal/")) {
      skippedMeals += 1;
      return;
    }
    if (href.includes("/product/")) {
      const absolute = href.startsWith("http")
        ? href
        : `https://www.mcdonalds.com${href}`;
      links.add(absolute.split("#")[0]);
    }
  });
  if (skippedMeals > 0) {
    console.log(`Skipped ${skippedMeals} meal links (menu combos).`);
  }
  return Array.from(links);
}

async function collectProductLinksFromSitemap() {
  const links = new Set();
  for (const sitemapUrl of SITEMAP_URLS) {
    try {
      const response = await fetch(sitemapUrl);
      if (!response.ok) continue;
      const xml = await response.text();
      const $ = cheerio.load(xml, { xmlMode: true });
      const sitemapLocs = $("sitemap loc")
        .map((_, node) => $(node).text().trim())
        .get()
        .filter(Boolean);
      const urlLocs = $("url loc")
        .map((_, node) => $(node).text().trim())
        .get()
        .filter(Boolean);
      urlLocs.forEach((loc) => {
        if (loc.includes("/us/en-us/product/")) {
          links.add(loc.split("#")[0]);
        }
      });
      for (const loc of sitemapLocs) {
        if (!loc.includes("product") && !loc.includes("menu")) continue;
        const childResponse = await fetch(loc);
        if (!childResponse.ok) continue;
        const childXml = await childResponse.text();
        const child$ = cheerio.load(childXml, { xmlMode: true });
        child$("url loc")
          .map((_, node) => child$(node).text().trim())
          .get()
          .filter(Boolean)
          .forEach((childLoc) => {
            if (childLoc.includes("/us/en-us/product/")) {
              links.add(childLoc.split("#")[0]);
            }
          });
      }
    } catch {
      continue;
    }
    if (links.size > 0) break;
  }
  if (links.size > 0) {
    console.log(`Loaded ${links.size} product links from sitemap.`);
  }
  return Array.from(links);
}

function extractNutritionFromJsonLd($) {
  let result = null;
  $("script[type=\"application/ld+json\"]").each((_, node) => {
    const raw = $(node).text();
    if (!raw || result) return;
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      nodes.forEach((entry) => {
        if (!entry || result) return;
        const product = entry["@type"] === "Product" ? entry : entry.item || entry;
        if (!product) return;
        const nutrition = product.nutrition || product.nutritionInfo;
        if (!nutrition) return;
        const calories = extractNumber(nutrition.calories || nutrition.energy || nutrition.energyContent);
        const fat = extractNumber(nutrition.fatContent || nutrition.totalFat);
        const carbs = extractNumber(nutrition.carbohydrateContent || nutrition.totalCarbohydrate);
        const protein = extractNumber(nutrition.proteinContent || nutrition.protein);
        result = {
          name: product.name,
          servingSize: normalizeServingSize(nutrition.servingSize || nutrition.servingSizeDescription),
          calories,
          fat,
          carbs,
          protein,
        };
      });
    } catch {
      return;
    }
  });
  return result;
}

function extractNutritionFromNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    const pageProps = data?.props?.pageProps;
    const product = pageProps?.product || pageProps?.item || pageProps?.menuItem;
    const nutrition = product?.nutrition || product?.nutritionInfo || product?.nutritionalInfo;
    if (!product || !nutrition) return null;
    return {
      name: product?.name,
      servingSize: normalizeServingSize(nutrition?.servingSize || nutrition?.servingSizeDescription),
      calories: extractNumber(nutrition?.calories),
      fat: extractNumber(nutrition?.fat),
      carbs: extractNumber(nutrition?.carbs),
      protein: extractNumber(nutrition?.protein),
    };
  } catch {
    return null;
  }
}

function hasRequiredMacros(payload) {
  if (!payload) return false;
  return (
    payload.calories != null &&
    payload.protein != null &&
    payload.carbs != null &&
    payload.fat != null
  );
}

async function fetchProductVariants(url, page) {
  let nutritionPayload = null;
  const itemDetailsPayloads = [];
  let itemListPayload = null;
  const itemListIds = new Set();
  const matchedUrls = new Set();
  const handler = async (response) => {
    try {
      const resUrl = response.url();
      const contentType = response.headers()["content-type"] || "";
      if (!contentType.includes("application/json")) return;
      if (!/nutrition|product|menu|item/i.test(resUrl)) return;
      const data = await response.json();
      if (!data) return;
      if (resUrl.includes("itemList")) {
        if (resUrl.includes("nutrient_req=Y")) {
          console.log("[McDonalds] itemList payload keys", Object.keys(data || {}));
        }
        const itemParam = resUrl.match(/[?&]item=([^&]+)/i);
        if (itemParam?.[1]) {
          const idsFromUrl = itemParam[1].match(/\d{6}/g) || [];
          idsFromUrl.forEach((id) => itemListIds.add(id));
        }
        itemListPayload = data;
      }
      if (resUrl.includes("itemDetails")) {
        const itemParam = resUrl.match(/[?&]item=(\d+)/i);
        if (itemParam?.[1]) {
          itemListIds.add(itemParam[1]);
        }
        writeDebugLog({
          sessionId: "debug-session",
          runId: "run1",
          hypothesisId: "H1",
          location: "scripts/scrapers/restaurants/mcdonalds.mjs:fetchProductNutrition:itemDetails",
          message: "Received itemDetails payload for McDonalds product",
          data: {
            url: resUrl,
            hasItem: Boolean(data?.item || data?.itemDetails),
          },
          timestamp: Date.now(),
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a53cc982-83ed-4774-8822-232eb34f84dd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'H1',
            location: 'scripts/scrapers/restaurants/mcdonalds.mjs:fetchProductNutrition:itemDetails',
            message: 'Received itemDetails payload for McDonalds product',
            data: {
              url: resUrl,
              hasItem: Boolean(data?.item || data?.itemDetails),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion agent log
        itemDetailsPayloads.push(data);
      } else {
        writeDebugLog({
          sessionId: "debug-session",
          runId: "run1",
          hypothesisId: "H2",
          location: "scripts/scrapers/restaurants/mcdonalds.mjs:fetchProductNutrition:nutritionPayload",
          message: "Received generic nutrition payload for McDonalds product",
          data: {
            url: resUrl,
            keys: Object.keys(data || {}),
          },
          timestamp: Date.now(),
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/a53cc982-83ed-4774-8822-232eb34f84dd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'H2',
            location: 'scripts/scrapers/restaurants/mcdonalds.mjs:fetchProductNutrition:nutritionPayload',
            message: 'Received generic nutrition payload for McDonalds product',
            data: {
              url: resUrl,
              keys: Object.keys(data || {}),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion agent log
        nutritionPayload = data;
      }
      matchedUrls.add(resUrl);
    } catch {
      return;
    }
  };

  page.on("response", handler);
  const html = await fetchRenderedHtml(url, page);
  page.off("response", handler);

  if (!html) return [];
  const $ = cheerio.load(html);
  let baseNutrition = null;
  const jsonLd = extractNutritionFromJsonLd($);
  if (hasRequiredMacros(jsonLd)) {
    baseNutrition = jsonLd;
  }
  if (jsonLd) {
    console.warn(`JSON-LD incomplete for ${url}, falling back to API.`);
  }
  const nextData = extractNutritionFromNextData(html);
  if (!baseNutrition && hasRequiredMacros(nextData)) {
    baseNutrition = nextData;
  }
  if (nextData) {
    console.warn(`__NEXT_DATA__ incomplete for ${url}, falling back to API.`);
  }

  if (!baseNutrition && (itemDetailsPayloads.length > 0 || nutritionPayload)) {
    for (const payload of itemDetailsPayloads) {
      const parsedFromApi = parseNutritionFromMcDonaldsApi(payload);
      if (parsedFromApi) {
        baseNutrition = parsedFromApi;
        break;
      }
    }
    if (!baseNutrition && nutritionPayload) {
      const parsedFromApi = parseNutritionFromMcDonaldsApi(nutritionPayload);
      if (parsedFromApi) {
        baseNutrition = parsedFromApi;
      }
    }
    if (!baseNutrition && itemDetailsPayloads.length > 0) {
      const payload = itemDetailsPayloads[itemDetailsPayloads.length - 1];
      const item = payload.item || payload;
      const nutrientCount = item?.nutrient_facts?.nutrient?.length ?? 0;
      console.warn(
        `itemDetails payload seen but not parsed for ${url}. nutrient_facts length: ${nutrientCount}`
      );
    }
  }

  if (!baseNutrition) {
    const itemId = extractItemIdFromHtml(html);
    if (itemId) {
      console.log(`Direct itemDetails lookup for ${url}: item ${itemId}`);
      const directPayload = await fetchItemDetailsById(itemId);
      if (directPayload) {
        const parsedDirect = parseNutritionFromMcDonaldsApi(directPayload);
        if (parsedDirect) {
          baseNutrition = parsedDirect;
        } else {
          console.warn(`itemDetails fetched but parse failed for ${url}`);
        }
      } else {
        console.warn(`itemDetails fetch failed for ${url}`);
      }
    } else {
      console.warn(`No item_id found in HTML for ${url}. HTML length: ${html.length}`);
    }
  }

  if (!baseNutrition && matchedUrls.size > 0) {
    console.warn(
      `No nutrition parsed for ${url}. JSON endpoints seen:\n${Array.from(matchedUrls)
        .slice(0, 3)
        .join("\n")}`
    );
  }

  const title = $("h1").first().text().trim();
  if (!baseNutrition) {
    baseNutrition = {
      name: title || null,
      servingSize: "1 serving",
      calories: null,
      fat: null,
      carbs: null,
      protein: null,
    };
  }

  const variants = await expandVariantsFromItemList(itemListPayload, itemListIds);
  if (variants.length === 0) {
    return [baseNutrition];
  }

  const seen = new Set();
  const allItems = [];
  for (const item of variants) {
    const key = item?.name?.toLowerCase() || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    allItems.push(item);
  }
  if (baseNutrition?.name) {
    const baseKey = baseNutrition.name.toLowerCase();
    if (!seen.has(baseKey)) {
      allItems.push(baseNutrition);
    }
  }
  return allItems;
}

function extractItemIdFromHtml(html) {
  const patterns = [
    /"item_id"\s*:\s*(\d+)/i,
    /"itemId"\s*:\s*(\d+)/i,
    /item=(\d{6})/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function collectItemIdsFromPayload(payload) {
  const ids = new Set();
  const stack = [payload];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (Array.isArray(current)) {
      current.forEach((entry) => stack.push(entry));
      continue;
    }
    if (typeof current === "object") {
      const idValue =
        current.item_id ??
        current.itemId ??
        current.id ??
        current.external_id ??
        null;
      const nameValue =
        current.item_name ??
        current.item_marketing_name ??
        current.name ??
        current.displayName ??
        current.title ??
        null;
      if (idValue && nameValue) {
        const normalized = String(idValue).replace(/\D/g, "");
        if (normalized) ids.add(normalized);
      }
      Object.values(current).forEach((value) => stack.push(value));
    }
  }
  return Array.from(ids);
}

async function expandVariantsFromItemList(itemListPayload, itemListIds) {
  const ids = new Set();
  if (itemListPayload) {
    collectItemIdsFromPayload(itemListPayload).forEach((id) => ids.add(id));
  }
  if (itemListIds && itemListIds.size > 0) {
    itemListIds.forEach((id) => ids.add(id));
  }
  if (ids.size === 0) return [];

  const variants = [];
  for (const id of ids) {
    const payload = await fetchItemDetailsById(id);
    if (!payload) continue;
    const parsed = parseNutritionFromMcDonaldsApi(payload);
    if (hasRequiredMacros(parsed)) {
      variants.push(parsed);
    }
  }
  return variants;
}

async function fetchItemDetailsById(itemId) {
  const url = `https://www.mcdonalds.com/dnaapp/itemDetails?country=US&language=en&showLiveData=true&item=${itemId}`;
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) {
      console.warn(`Failed itemDetails fetch (${itemId}): ${response.statusText}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(`Failed itemDetails fetch (${itemId})`, error);
    return null;
  }
}

function findFirstString(value, keys) {
  if (!value) return null;
  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (Array.isArray(current)) {
      current.forEach((entry) => stack.push(entry));
      continue;
    }
    if (typeof current === "object") {
      for (const key of keys) {
        const candidate = current?.[key];
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate.trim();
        }
      }
      Object.values(current).forEach((entry) => stack.push(entry));
    }
  }
  return null;
}

function findNutrientList(value) {
  if (!value) return null;
  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (Array.isArray(current)) {
      if (current.length > 0 && typeof current[0] === "object") {
        const hasNutrientKey =
          current[0]?.nutrient_name_id ||
          current[0]?.name ||
          current[0]?.nutrientId;
        if (hasNutrientKey) return current;
      }
      current.forEach((entry) => stack.push(entry));
      continue;
    }
    if (typeof current === "object") {
      if (Array.isArray(current?.nutrient)) {
        return current.nutrient;
      }
      Object.values(current).forEach((entry) => stack.push(entry));
    }
  }
  return null;
}

function findItemWithNutrients(value) {
  if (!value) return null;
  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (Array.isArray(current)) {
      current.forEach((entry) => stack.push(entry));
      continue;
    }
    if (typeof current === "object") {
      if (Array.isArray(current?.nutrient_facts?.nutrient)) {
        const hasName =
          current?.item_name ||
          current?.item_marketing_name ||
          current?.name ||
          current?.displayName ||
          current?.title;
        if (hasName) return current;
      }
      Object.values(current).forEach((entry) => stack.push(entry));
    }
  }
  return null;
}

function getMacroScore(list) {
  if (!Array.isArray(list)) return 0;
  const keys = list
    .map((entry) => String(entry?.nutrient_name_id || entry?.name || "").toLowerCase())
    .filter(Boolean);
  const has = (token) => keys.some((key) => key.includes(token));
  let score = 0;
  if (has("calories")) score += 1;
  if (has("protein")) score += 1;
  if (has("carbohydrate")) score += 1;
  if (has("fat")) score += 1;
  return score;
}

function parseNutritionFromMcDonaldsApi(payload) {
  const directItem = payload?.item;
  if (String(process.env.MCD_TRACE_FAIL || "").trim() === "1") {
    const name =
      directItem?.item_marketing_name ||
      directItem?.item_name ||
      directItem?.name ||
      directItem?.displayName ||
      directItem?.title ||
      null;
    const listLen = directItem?.nutrient_facts?.nutrient?.length ?? 0;
    console.log("[McDonalds][TRACE] Payload summary", {
      hasItem: Boolean(directItem),
      name,
      nutrientCount: listLen,
    });
  }
  if (directItem?.nutrient_facts?.nutrient) {
    const name =
      directItem?.item_marketing_name ||
      directItem?.item_name ||
      directItem?.name ||
      directItem?.displayName ||
      directItem?.title ||
      null;
    if (name) {
      const directList = directItem.nutrient_facts.nutrient;
      const directParsed = {
        itemId: directItem?.item_id || directItem?.id || directItem?.external_id || null,
        name,
        nutrientList: directList,
      };
      const byId = new Map();
      directList.forEach((entry) => {
        const key = entry?.nutrient_name_id || entry?.name;
        if (!key) return;
        byId.set(String(key).toLowerCase(), extractNumber(entry?.value));
      });
      const calories = byId.get("calories");
      const protein = byId.get("protein");
      const carbs = byId.get("carbohydrate");
      const fat = byId.get("fat");
      if (String(process.env.MCD_TRACE_FAIL || "").trim() === "1") {
        console.log("[McDonalds][TRACE] Direct macros", {
          name,
          itemId: directParsed.itemId,
          calories,
          protein,
          carbs,
          fat,
        });
      }
      if (calories != null && protein != null && carbs != null && fat != null) {
        return {
          name,
          servingSize: normalizeServingSize(
            directItem?.serving_size ||
              directItem?.servingSize ||
              directItem?.serving_size_description ||
              "1 serving"
          ),
          calories,
          fat,
          carbs,
          protein,
          saturatedFat: byId.get("saturated_fat") ?? null,
          transFat: byId.get("trans_fat") ?? null,
          cholesterol: byId.get("cholesterol") ?? null,
          sodium: byId.get("sodium") ?? null,
          fiber: byId.get("fibre") ?? null,
          sugars: byId.get("sugars") ?? null,
          itemId: directParsed.itemId ? String(directParsed.itemId) : null,
        };
      }
      const directResult = buildNutritionFromList(directParsed, directItem);
      if (directResult) return directResult;
      const forced = forceBuildFromList(directParsed, directItem);
      if (forced) return forced;
      if (String(process.env.MCD_TRACE_FAIL || "").trim() === "1") {
        const sample = directParsed.nutrientList
          .slice(0, 6)
          .map((entry) => ({
            id: entry?.nutrient_name_id || null,
            name: entry?.name || null,
            value: entry?.value ?? null,
          }));
        console.log("[McDonalds][TRACE] Failed direct parse", {
          name: directParsed.name,
          itemId: directParsed.itemId,
          sample,
        });
      }
    }
  }

  let item = payload?.item || payload?.itemDetails || payload;
  if (item?.item) {
    item = item.item;
  }
  if (item?.itemDetails) {
    item = item.itemDetails;
  }
  const nestedItem = findItemWithNutrients(item) || findItemWithNutrients(payload);

  const candidates = [
    payload?.item,
    payload?.itemDetails,
    item,
    nestedItem,
  ].filter((candidate) => candidate && typeof candidate === "object");

  let bestItem = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const list =
      candidate?.nutrient_facts?.nutrient ||
      candidate?.nutrients ||
      candidate?.nutritionalInformation;
    const score = getMacroScore(list);
    if (score > bestScore) {
      bestScore = score;
      bestItem = candidate;
    }
  }

  if (bestItem) {
    item = bestItem;
  }
  const parsed = parseNutritionFromItemPayload(item, payload);
  if (!parsed) return null;
  return buildNutritionFromList(parsed, item);
}

function buildNutritionFromList(parsed, item) {
  const { itemId, name, nutrientList } = parsed;
  // #region agent log
  try {
    writeDebugLog({
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "H3",
      location: "scripts/scrapers/restaurants/mcdonalds.mjs:parseNutritionFromMcDonaldsApi:beforeMap",
      message: "Inspecting nutrient_facts entries for McDonalds product",
      data: {
        itemId: itemId ?? null,
        name: name ?? null,
        sampleKeys: Array.isArray(nutrientList)
          ? nutrientList.slice(0, 5).map((entry) => ({
              id: entry?.nutrient_name_id || entry?.name || null,
            }))
          : [],
        listLength: Array.isArray(nutrientList) ? nutrientList.length : 0,
      },
      timestamp: Date.now(),
    });
    const sampleKeys = Array.isArray(nutrientList)
      ? nutrientList.slice(0, 5).map((entry) => ({
          id: entry?.nutrient_name_id || entry?.name || null,
        }))
      : [];
    fetch('http://127.0.0.1:7242/ingest/a53cc982-83ed-4774-8822-232eb34f84dd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'H3',
        location: 'scripts/scrapers/restaurants/mcdonalds.mjs:parseNutritionFromMcDonaldsApi:beforeMap',
        message: 'Inspecting nutrient_facts entries for McDonalds product',
        data: {
          itemId: itemId ?? null,
          name: name ?? null,
          sampleKeys,
          listLength: Array.isArray(nutrientList) ? nutrientList.length : 0,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch {
    // ignore logging errors
  }
  // #endregion agent log

  const byId = new Map();
  const normalizeKey = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  nutrientList.forEach((entry) => {
    const key = entry?.nutrient_name_id || entry?.name;
    if (!key) return;
    const value = extractNumber(entry?.value);
    byId.set(String(key).toLowerCase(), value);
    const normalized = normalizeKey(entry?.name);
    if (normalized) {
      byId.set(normalized, value);
    }
  });

  const getNutrient = (keys) => {
    for (const key of keys) {
      if (byId.has(key)) {
        return byId.get(key);
      }
    }
    return null;
  };

  const findByMatch = (patterns) => {
    const normalizedPatterns = patterns.map((pattern) => normalizeKey(pattern));
    for (const entry of nutrientList) {
      const id = normalizeKey(entry?.nutrient_name_id || entry?.name);
      if (!id) continue;
      if (normalizedPatterns.some((pattern) => id.includes(pattern))) {
        const value = extractNumber(entry?.value);
        if (value != null) return value;
      }
    }
    return null;
  };

  const calories = getNutrient(["calories"]) ?? findByMatch(["calories"]);
  const protein = getNutrient(["protein"]) ?? findByMatch(["protein"]);
  const carbs =
    getNutrient([
      "carbohydrate",
      "carbohydrates",
      "carbs",
      "total_carbohydrate",
      "total_carbohydrates",
      "totalcarbohydrate",
      "totalcarbohydrates",
    ]) ?? findByMatch(["carbohydrate", "carbohydrates", "totalcarbohydrate"]);
  const fat =
    getNutrient(["fat", "total_fat", "totalfat", "totalfats"]) ??
    findByMatch(["fat", "totalfat"]);

  if (String(process.env.MCD_DEBUG || "").trim() === "1") {
    console.log("[McDonalds][DEBUG] Parsed macros", {
      name,
      calories,
      protein,
      carbs,
      fat,
      nutrientKeys: Array.from(byId.keys()).slice(0, 12),
    });
  }
  const saturatedFat = getNutrient(["saturated_fat"]);
  const transFat = getNutrient(["trans_fat"]);
  const cholesterol = getNutrient(["cholesterol"]);
  const sodium = getNutrient(["sodium"]);
  const fiber = getNutrient(["fibre", "fiber", "dietary_fiber"]);
  const sugars = getNutrient(["sugars", "total_sugars"]);

  if (calories == null || fat == null || carbs == null || protein == null) return null;

  // #region agent log
  try {
    writeDebugLog({
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "H4",
      location: "scripts/scrapers/restaurants/mcdonalds.mjs:parseNutritionFromMcDonaldsApi:parsed",
      message: "Parsed nutrition from McDonalds API",
      data: {
        itemId: itemId ?? null,
        name,
        calories,
        protein,
        carbs,
        fat,
      },
      timestamp: Date.now(),
    });
    fetch('http://127.0.0.1:7242/ingest/a53cc982-83ed-4774-8822-232eb34f84dd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'H4',
        location: 'scripts/scrapers/restaurants/mcdonalds.mjs:parseNutritionFromMcDonaldsApi:parsed',
        message: 'Parsed nutrition from McDonalds API',
        data: {
          itemId: itemId ?? null,
          name,
          calories,
          protein,
          carbs,
          fat,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch {
    // ignore logging errors
  }
  // #endregion agent log

  return {
    name,
    servingSize: normalizeServingSize(
      item?.serving_size ||
        item?.servingSize ||
        item?.serving_size_description ||
        "1 serving"
    ),
    calories,
    fat,
    carbs,
    protein,
    saturatedFat: saturatedFat ?? null,
    transFat: transFat ?? null,
    cholesterol: cholesterol ?? null,
    sodium: sodium ?? null,
    fiber: fiber ?? null,
    sugars: sugars ?? null,
    itemId: itemId ? String(itemId) : null,
  };
}

function forceBuildFromList(parsed, item) {
  const byId = new Map();
  parsed.nutrientList.forEach((entry) => {
    const key = entry?.nutrient_name_id || entry?.name;
    if (!key) return;
    byId.set(String(key).toLowerCase(), extractNumber(entry?.value));
  });

  const calories = byId.get("calories");
  const protein = byId.get("protein");
  const carbs = byId.get("carbohydrate");
  const fat = byId.get("fat");

  if (calories == null || protein == null || carbs == null || fat == null) {
    return null;
  }

  return {
    name: parsed.name,
    servingSize: normalizeServingSize(
      item?.serving_size ||
        item?.servingSize ||
        item?.serving_size_description ||
        "1 serving"
    ),
    calories,
    fat,
    carbs,
    protein,
    saturatedFat: byId.get("saturated_fat") ?? null,
    transFat: byId.get("trans_fat") ?? null,
    cholesterol: byId.get("cholesterol") ?? null,
    sodium: byId.get("sodium") ?? null,
    fiber: byId.get("fibre") ?? null,
    sugars: byId.get("sugars") ?? null,
    itemId: parsed.itemId ? String(parsed.itemId) : null,
  };
}

function parseNutritionFromItemPayload(item, payloadFallback) {
  if (!item || typeof item !== "object") return null;
  const itemId =
    item?.item_id ||
    item?.id ||
    item?.external_id ||
    payloadFallback?.item_id ||
    payloadFallback?.id ||
    payloadFallback?.external_id;
  const name =
    findFirstString(item, [
      "item_name",
      "item_marketing_name",
      "name",
      "displayName",
      "title",
    ]) || findFirstString(payloadFallback, ["item_name", "item_marketing_name", "name"]);
  const nutrientList =
    item?.nutrient_facts?.nutrient ||
    item?.nutrients ||
    item?.nutritionalInformation ||
    findNutrientList(item) ||
    findNutrientList(payloadFallback);
  if (!name || !nutrientList || !Array.isArray(nutrientList)) return null;
  return {
    itemId,
    name,
    nutrientList,
  };
}

export async function scrapeMcDonalds({ db }) {
  let totalItemsAdded = 0;
  console.log("Fetching McDonald's menu...");

  let chromium;
  let firefox;
  try {
    ({ chromium, firefox } = await import("playwright"));
  } catch (error) {
    console.error("Playwright is not installed. Run: npm install -D playwright");
    console.error(error);
    return 0;
  }

  const headless = String(process.env.HEADLESS || "true").toLowerCase() !== "false";
  let browser;
  try {
    browser = await chromium.launch({
      headless,
      args: ["--disable-http2", "--disable-blink-features=AutomationControlled"],
    });
  } catch (error) {
    console.warn("Chromium failed to launch, retrying with Firefox.", error);
    browser = await firefox.launch({ headless });
  }
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120000);
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "media" || type === "font") {
      return route.abort();
    }
    return route.continue();
  });

  let productLinks = [];
  try {
    const html = await fetchRenderedHtml(MENU_URL, page);
    if (!html) {
      console.error("Failed to fetch McDonald's menu.");
      await browser.close();
      return 0;
    }
    const $ = cheerio.load(html);
    productLinks = collectProductLinks($);
  } catch (error) {
    console.error("Failed to fetch McDonald's menu:", error);
    await browser.close();
    return 0;
  }

  if (productLinks.length < 200 || process.env.MCD_USE_SITEMAP === "1") {
    const sitemapLinks = await collectProductLinksFromSitemap();
    productLinks = Array.from(new Set([...productLinks, ...sitemapLinks]));
  }

  if (productLinks.length === 0) {
    console.warn("No McDonald's product links detected. Page may be JS-rendered.");
    await browser.close();
    return 0;
  }

  console.log(`Found ${productLinks.length} McDonald's product links.`);

  for (const url of productLinks) {
    if (url.includes("/meal/")) {
      continue;
    }
    const items = await fetchProductVariants(url, page);
    if (items.length === 0) continue;

    for (const nutrition of items) {
      if (!nutrition?.name) continue;
      if (
        nutrition.calories == null ||
        nutrition.protein == null ||
        nutrition.carbs == null ||
        nutrition.fat == null
      ) {
        console.warn(`Skipping ${nutrition.name}: missing nutrition data.`);
        continue;
      }

      const existing = await db
        .select()
        .from(foodItems)
        .where(
          and(eq(foodItems.name, nutrition.name), eq(foodItems.diningHall, DINING_HALL_NAME))
        )
        .limit(1);

      if (existing.length > 0) {
        continue;
      }

      await db.insert(foodItems).values({
        name: nutrition.name,
        servingSize: nutrition.servingSize || "1 serving",
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
        ingredients: null,
        allergens: null,
        diningHall: DINING_HALL_NAME,
        station: MENU_STATION,
        recNumAndPort: nutrition.itemId ? `mcd-${nutrition.itemId}` : url.slice(0, 50),
      });

      totalItemsAdded += 1;
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  await browser.close();
  console.log(`Added ${totalItemsAdded} McDonald's items.`);
  return totalItemsAdded;
}

async function fetchRenderedHtml(url, pageInstance) {
  try {
    const page = pageInstance;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await acceptCookieBanner(page);
    await page.waitForTimeout(1500);
    return await page.content();
  } catch (error) {
    console.warn(`Primary render failed for: ${url}`, error);
    try {
      const page = pageInstance;
      await page.goto(url, { waitUntil: "commit", timeout: 60000 });
      await acceptCookieBanner(page);
      await page.waitForSelector("a[href*=\"/product/\"], a[href*=\"/meal/\"]", {
        timeout: 10000,
      });
      await page.waitForTimeout(1500);
      return await page.content();
    } catch (fallbackError) {
      console.warn(`Failed to render page: ${url}`, fallbackError);
      return null;
    }
  }
}

async function acceptCookieBanner(page) {
  if (cookieAccepted) return;
  try {
    const acceptButton = page.locator("button:has-text(\"Accept\")").first();
    if (await acceptButton.isVisible({ timeout: 2000 })) {
      await acceptButton.click({ timeout: 2000 });
      cookieAccepted = true;
      await page.waitForTimeout(500);
    }
  } catch {
    return;
  }
}
