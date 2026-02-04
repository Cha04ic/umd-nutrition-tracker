import axios from "axios";
import { createRequire } from "module";
import { normalizeOrderItemName } from "./orderParser";

type ParsedOrderItem = {
  name: string;
  quantity: number;
};

const STOP_MARKERS = [
  "subtotal",
  "tax",
  "total",
  "meal fare",
  "fees",
  "delivery",
  "tip",
  "payment",
  "order completed",
  "order total",
];

export async function parseReceiptPdfItems(url: string): Promise<ParsedOrderItem[]> {
  try {
    const { data, headers, request } = await axios.get(url, {
      responseType: "arraybuffer",
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });
    const contentType = String(headers["content-type"] || "").toLowerCase();
    const resolvedUrl = request?.res?.responseUrl ?? url;
    const looksLikePdf = contentType.includes("pdf") || Buffer.from(data).slice(0, 4).toString("utf8") === "%PDF";
    if (!looksLikePdf) {
      console.warn("[Orders] Receipt URL is not a PDF", { url: resolvedUrl, contentType });
      return [];
    }
    return await parseReceiptPdfBuffer(Buffer.from(data));
  } catch (error) {
    console.warn("[Orders] Failed to parse receipt PDF", { url, error });
    return [];
  }
}

export async function parseReceiptPdfBuffer(buffer: Buffer): Promise<ParsedOrderItem[]> {
  const parsed = await parseReceiptPdfBufferWithText(buffer);
  return parsed.items;
}

export async function parseReceiptPdfBufferWithText(buffer: Buffer): Promise<{
  items: ParsedOrderItem[];
  text: string;
}> {
  const require = createRequire(import.meta.url);
  const pdfModule = require("pdf-parse");
  const PDFParse = pdfModule?.PDFParse;
  if (!PDFParse) return { items: [], text: "" };
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  return {
    items: parseItemsFromText(parsed.text),
    text: parsed.text,
  };
}

function parseItemsFromText(text: string): ParsedOrderItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items: ParsedOrderItem[] = [];
  const pricedLine = /^(\d+)\s+(.+?)\s+\$?\d[\d,.]*$/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const normalized = line.toLowerCase();
    if (STOP_MARKERS.some((marker) => normalized.includes(marker))) {
      continue;
    }
    const pricedMatch = line.match(pricedLine);
    if (pricedMatch) {
      let name = pricedMatch[2];
      const nextLine = lines[i + 1];
      if (nextLine && shouldAppendFlavorLine(nextLine)) {
        const flavor = extractFlavorHint(nextLine);
        if (flavor) {
          name = `${name} ${flavor}`;
          i += 1;
        }
      }
      items.push({
        name: normalizeOrderItemName(name),
        quantity: Math.max(1, parseInt(pricedMatch[1], 10)),
      });
    }
  }

  if (items.length > 0) {
    return dedupeItems(items);
  }

  let inItems = false;
  for (const line of lines) {
    const normalized = line.toLowerCase();
    if (!inItems && (normalized.includes("order details") || normalized === "items")) {
      inItems = true;
      continue;
    }
    if (!inItems) continue;
    if (STOP_MARKERS.some((marker) => normalized.includes(marker))) {
      break;
    }

    const qtyPrefix = line.match(/^(\d+)\s*[xX]\s+(.+)$/);
    if (qtyPrefix) {
      items.push({
        name: normalizeOrderItemName(qtyPrefix[2]),
        quantity: Math.max(1, parseInt(qtyPrefix[1], 10)),
      });
      continue;
    }

    const qtySuffix = line.match(/^(.+?)\s+[xX]\s*(\d+)$/);
    if (qtySuffix) {
      items.push({
        name: normalizeOrderItemName(qtySuffix[1]),
        quantity: Math.max(1, parseInt(qtySuffix[2], 10)),
      });
      continue;
    }

    const pricedMatch = line.match(/^(.+?)\s+\$?\d[\d,.]*$/);
    if (pricedMatch) {
      items.push({
        name: normalizeOrderItemName(pricedMatch[1]),
        quantity: 1,
      });
    }
  }

  return dedupeItems(items);
}

function dedupeItems(items: ParsedOrderItem[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.name.toLowerCase();
    map.set(key, (map.get(key) ?? 0) + item.quantity);
  }
  return Array.from(map.entries()).map(([name, quantity]) => ({
    name,
    quantity,
  }));
}

function shouldAppendFlavorLine(line: string) {
  const normalized = line.toLowerCase();
  if (STOP_MARKERS.some((marker) => normalized.includes(marker))) return false;
  if (/\$?\d[\d,.]*$/.test(line)) return false;
  return /(sauce|spicy|sweet|bbq|buffalo|ranch|garlic|honey|pepper)/i.test(line);
}

function extractFlavorHint(line: string) {
  const cleaned = line
    .replace(/\d+/g, " ")
    .replace(/\bpc\b|\bpcs\b|\bpiece\b|\bpieces\b/gi, " ")
    .replace(/\bbone\s?-?\s?in\b/gi, " ")
    .replace(/\bwings?\b/gi, " ")
    .replace(/\bsauce\b/gi, " ")
    .replace(/\bpopeyes\b/gi, " ")
    .replace(/\bsignature\b/gi, " ")
    .replace(/[^a-z\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}
