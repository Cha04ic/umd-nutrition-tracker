type ParsedOrderItem = {
  name: string;
  quantity: number;
};

export type ParsedOrder = {
  restaurant: string | null;
  orderId: string | null;
  items: ParsedOrderItem[];
  receiptPdfUrl?: string | null;
};

export function parseOrderEmail(subject: string, body: string, html?: string): ParsedOrder {
  const htmlText = html ? stripHtml(html) : "";
  const text = `${subject}\n${body}\n${htmlText}`;
  const restaurantMatch = text.match(/Restaurant:\s*(.+)/i);
  const uberRestaurantMatch = text.match(/receipt for\s+([^.\n]+)/i) || text.match(/from\s+([^.\n]+)/i);
  const orderIdMatch = text.match(/Order ID:\s*(.+)/i);
  let items = parseItems(body);
  if (items.length === 0 && htmlText) {
    items = parseItems(htmlText);
  }
  if (items.length === 0) {
    items = parseItemsSmart(text);
  }
  if (items.length === 0) {
    items = extractItemsFromText(text);
  }
  const receiptPdfUrl = findReceiptPdfUrl(body, html);
  traceBody(subject, body, items.length, html, receiptPdfUrl);

  return {
    restaurant: normalizeRestaurant(restaurantMatch?.[1] || uberRestaurantMatch?.[1]),
    orderId: orderIdMatch ? orderIdMatch[1].trim() : null,
    items,
    receiptPdfUrl,
  };
}

function parseItems(body: string): ParsedOrderItem[] {
  const lines = body.split(/\r?\n/);
  const items: ParsedOrderItem[] = [];
  let inItems = false;
  let lastCandidateLine = "";

  const pushItem = (name: string, quantity: number) => {
    const normalizedName = normalizeOrderItemName(name);
    if (!normalizedName) return;
    const existing = items.find((item) => item.name === normalizedName);
    if (existing) {
      existing.quantity += quantity;
      return;
    }
    items.push({ name: normalizedName, quantity });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const qtyMatch = line.match(/^qty\s*[:#]?\s*(\d+)/i);
    if (qtyMatch && lastCandidateLine && !isNonItemLine(lastCandidateLine)) {
      const qty = Math.max(1, parseInt(qtyMatch[1], 10));
      if (!isPriceLine(lastCandidateLine)) {
        pushItem(lastCandidateLine, qty);
      }
      continue;
    }
    const inlineItemsMatch = line.match(/^Items?\s*(?:[:\-])?\s*(.+)$/i);
    if (inlineItemsMatch?.[1]) {
      const list = inlineItemsMatch[1]
        .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
      list.forEach((entry) => {
        pushItem(entry, 1);
      });
      continue;
    }
    if (/^Items?$/i.test(line)) {
      inItems = true;
      continue;
    }
    if (/order details/i.test(line)) {
      inItems = true;
      continue;
    }
    if (/^Items:/i.test(line)) {
      inItems = true;
      continue;
    }
    const bulletMatch = line.match(/^-+\s*(.+?)(?:\s+x(\d+))?$/i);
    if (inItems && bulletMatch) {
      const quantity = bulletMatch[2] ? Math.max(1, parseInt(bulletMatch[2], 10)) : 1;
      pushItem(bulletMatch[1], quantity);
      continue;
    }
    if (inItems) {
      if (isNonItemLine(line)) {
        inItems = false;
        continue;
      }
      const listItems = splitInlineItems(line);
      if (listItems.length > 1) {
        listItems.forEach((entry) => {
          if (!isNonItemLine(entry)) {
            pushItem(entry, 1);
          }
        });
        continue;
      }
      const qtyMatch = line.match(/^(\d+)\s*[xX]\s+(.+)$/);
      if (qtyMatch && !isNonItemLine(qtyMatch[2])) {
        pushItem(qtyMatch[2], Math.max(1, parseInt(qtyMatch[1], 10)));
        continue;
      }
      const qtySuffixMatch = line.match(/^(.+?)\s+[xX]\s*(\d+)$/);
      if (qtySuffixMatch && !isNonItemLine(qtySuffixMatch[1])) {
        pushItem(qtySuffixMatch[1], Math.max(1, parseInt(qtySuffixMatch[2], 10)));
        continue;
      }
      const pricedMatch = line.match(/^(.+?)\s+\$?\d[\d,.]*$/);
      if (pricedMatch && !isNonItemLine(pricedMatch[1])) {
        pushItem(pricedMatch[1], 1);
      }
      continue;
    }
    if (!isNonItemLine(line) && !isPriceLine(line)) {
      lastCandidateLine = line;
    }
  }

  return items;
}

function parseItemsSmart(text: string): ParsedOrderItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const items: ParsedOrderItem[] = [];

  const pushItem = (name: string, quantity: number) => {
    const normalizedName = normalizeOrderItemName(name);
    if (!normalizedName) return;
    const existing = items.find((item) => item.name === normalizedName);
    if (existing) {
      existing.quantity += quantity;
      return;
    }
    items.push({ name: normalizedName, quantity });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isNonItemLine(line)) continue;

    const qtyPriceMatch = line.match(/^(\d+)\s+(.+?)\s+\$?\d[\d,.]*$/);
    if (qtyPriceMatch) {
      pushItem(qtyPriceMatch[2], Math.max(1, parseInt(qtyPriceMatch[1], 10)));
      continue;
    }

    const qtyXPriceMatch = line.match(/^(.+?)\s+[xX]\s*(\d+)\s+\$?\d/);
    if (qtyXPriceMatch) {
      pushItem(qtyXPriceMatch[1], Math.max(1, parseInt(qtyXPriceMatch[2], 10)));
      continue;
    }

    const qtyOnlyMatch = line.match(/^qty\s*[:#]?\s*(\d+)/i);
    if (qtyOnlyMatch && i > 0) {
      const candidate = lines[i - 1];
      if (!isNonItemLine(candidate) && !isPriceLine(candidate)) {
        pushItem(candidate, Math.max(1, parseInt(qtyOnlyMatch[1], 10)));
      }
      continue;
    }

    const nextLine = lines[i + 1];
    if (nextLine && /qty/i.test(nextLine)) {
      const qtyMatch = nextLine.match(/qty\s*[:#]?\s*(\d+)/i);
      if (qtyMatch) {
        pushItem(line, Math.max(1, parseInt(qtyMatch[1], 10)));
        continue;
      }
    }

    if (nextLine && /sauce|spicy|bbq|garlic|honey|buffalo|sweet|parmesan|ranch|mustard/i.test(nextLine)) {
      pushItem(`${line} ${nextLine}`, 1);
      i += 1;
      continue;
    }

    const inlineItemsMatch = line.match(/^Items?\s*(?:[:\-])?\s*(.+)$/i);
    if (inlineItemsMatch?.[1]) {
      const list = splitInlineItems(inlineItemsMatch[1]);
      list.forEach((entry) => pushItem(entry, 1));
      continue;
    }
  }

  return items;
}

function extractItemsFromText(text: string): ParsedOrderItem[] {
  const items: ParsedOrderItem[] = [];
  const blockMatch = text.match(
    /items?\s+(?<list>[\s\S]+?)(?:\btotal\b|\border\b|\bpayment\b|\bdelivery\b|\bpickup\b|$)/i
  );
  if (!blockMatch?.groups?.list) return items;
  const list = blockMatch.groups.list
    .replace(/\s+/g, " ")
    .trim();
  if (!list) return items;
  splitInlineItems(list).forEach((entry) => {
    if (!isNonItemLine(entry)) {
      items.push({ name: normalizeOrderItemName(entry), quantity: 1 });
    }
  });
  return items;
}

function splitInlineItems(value: string) {
  return value
    .split(/,|•|·|\u2022|\u00b7|\|/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<\/td>/gi, "\t")
    .replace(/<\/th>/gi, "\t")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\u00a0/g, " ")
    .replace(/\t+/g, "\t")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeRestaurant(value: string | undefined) {
  if (!value) return null;
  const raw = value.trim();
  const lower = raw.toLowerCase();
  if (lower.includes("mcdonald")) return "McDonald's";
  if (lower.includes("popeyes")) return "Popeyes";
  if (lower.includes("potbelly")) return "Potbelly";
  if (lower.includes("ubereats") || lower.includes("uber eats")) return "Uber Eats";
  if (lower.includes("doordash")) return "DoorDash";
  if (lower.includes("grubhub")) return "Grubhub";
  return raw;
}

function findReceiptPdfUrl(body: string, html?: string) {
  const bodyMatch = body.match(/https?:\/\/[^\s"']+\.pdf[^\s"']*/i);
  if (bodyMatch?.[0]) return bodyMatch[0];
  if (!html) return null;
  const hrefMatches = getHrefMatches(html);
  const pdfCandidates = hrefMatches.filter(link => /pdf/i.test(link) || /download/i.test(link));
  const pdfLink = pdfCandidates.find(link => /pdf/i.test(link)) ?? pdfCandidates[0];
  if (!pdfLink) return null;
  if (pdfLink.startsWith("http")) return pdfLink;
  if (pdfLink.startsWith("//")) return `https:${pdfLink}`;
  if (pdfLink.startsWith("/")) return `https://www.ubereats.com${pdfLink}`;
  return `https://${pdfLink}`;
}

function traceBody(
  subject: string,
  body: string,
  itemCount: number,
  html?: string,
  receiptPdfUrl?: string | null
) {
  const traceSubject = process.env.ORDER_TRACE_SUBJECT;
  if (!traceSubject) return;
  if (!subject.toLowerCase().includes(traceSubject.toLowerCase())) return;
  if (itemCount > 0) return;
  const preview = body.replace(/\s+/g, " ").trim().slice(0, 1200);
  console.log("[Orders][TRACE] Body preview", { subject, preview });
  if (html) {
    const htmlTextPreview = stripHtml(html).replace(/\s+/g, " ").trim().slice(0, 1200);
    const links = getHrefMatches(html);
    console.log("[Orders][TRACE] Html links", {
      subject,
      htmlLength: html.length,
      htmlTextPreview,
      receiptPdfUrl,
      linkCount: links.length,
      links,
    });
  } else {
    console.log("[Orders][TRACE] Html links", {
      subject,
      htmlLength: 0,
      receiptPdfUrl,
      linkCount: 0,
      links: [],
    });
  }
}

function getHrefMatches(html: string) {
  const hrefMatches: string[] = [];
  const regex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(html)) !== null) {
    hrefMatches.push(match[1]);
  }
  return hrefMatches;
}

function isNonItemLine(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("subtotal") ||
    normalized.includes("tax") ||
    normalized.includes("total") ||
    normalized.includes("fees") ||
    normalized.includes("delivery") ||
    normalized.includes("tip") ||
    normalized.includes("discount") ||
    normalized.includes("promotion") ||
    normalized.includes("order") ||
    normalized.includes("payment") ||
    normalized.includes("pickup") ||
    normalized.includes("completed") ||
    normalized.includes("receipt") ||
    normalized.includes("support") ||
    normalized.includes("account") ||
    normalized.includes("street") ||
    normalized.includes("st,") ||
    normalized.includes("st ") ||
    normalized.includes("ave") ||
    normalized.includes("blvd") ||
    normalized.includes("road") ||
    normalized.includes("rd") ||
    normalized.includes("drive") ||
    normalized.includes("dr") ||
    normalized.includes("lane") ||
    normalized.includes("ln")
  );
}

function isPriceLine(value: string) {
  return /^\$?\d[\d,.]*$/.test(value.trim());
}

export function normalizeOrderItemName(value: string) {
  const normalized = value
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\b(small|medium|large|xl|xs|regular)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized;
}

export function normalizeFoodName(value: string) {
  return value
    .replace(/\bsweet\s*'?n\s+spicy\b/gi, "sweet spicy")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\bpcs?\b/gi, "piece")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\b(small|medium|large|xl|xs|regular)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeFoodNameLoose(value: string) {
  return normalizeFoodName(value)
    .replace(/\bclassic\b/g, " ")
    .replace(/\bpieces?\b/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeFoodNameTokenKey(value: string) {
  const tokens = normalizeFoodNameLoose(value)
    .split(/\s+/)
    .filter(Boolean);
  return tokens.sort().join(" ");
}
