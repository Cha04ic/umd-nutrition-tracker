import axios from "axios";
import { ENV } from "../_core/env";

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const ALLOWED_SENDERS = [
  /@us\.mcdonalds\.com$/i,
  /@mcdonalds\.com$/i,
  /@potbelly\.com$/i,
  /@olo\.com$/i,
];

export function buildGmailAuthUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams();
  params.set("client_id", ENV.gmailClientId);
  params.set("redirect_uri", redirectUri);
  params.set("response_type", "code");
  params.set("scope", GMAIL_SCOPES.join(" "));
  params.set("access_type", "offline");
  params.set("prompt", "consent");
  params.set("state", state);
  params.set("include_granted_scopes", "true");

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailCode(code: string, redirectUri: string) {
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("client_id", ENV.gmailClientId);
  params.set("client_secret", ENV.gmailClientSecret);
  params.set("redirect_uri", redirectUri);
  params.set("grant_type", "authorization_code");

  const { data } = await axios.post(
    "https://oauth2.googleapis.com/token",
    params,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

export async function refreshGmailAccessToken(refreshToken: string) {
  const params = new URLSearchParams();
  params.set("client_id", ENV.gmailClientId);
  params.set("client_secret", ENV.gmailClientSecret);
  params.set("refresh_token", refreshToken);
  params.set("grant_type", "refresh_token");

  const { data } = await axios.post(
    "https://oauth2.googleapis.com/token",
    params,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  return data as { access_token: string; expires_in?: number };
}

export async function fetchGmailProfile(accessToken: string) {
  const { data } = await axios.get(
    "https://www.googleapis.com/gmail/v1/users/me/profile",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data as { emailAddress: string };
}

export async function fetchOrderEmails(accessToken: string) {
  const testSender = process.env.GMAIL_TEST_SENDER;
  const testSenderQuery = testSender ? ` OR from:${testSender}` : "";
  const testSenderRegex = testSender ? new RegExp(testSender.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
  const allowedSenderPatterns = testSenderRegex
    ? [...ALLOWED_SENDERS, testSenderRegex]
    : ALLOWED_SENDERS;

  const baseQuery = `in:anywhere (from:us.mcdonalds.com OR from:mcdonalds.com OR from:potbelly.com OR from:olo.com${testSenderQuery})`;
  const senderWideQuery = `in:anywhere (from:mcdonalds OR from:us.mcdonalds.com OR from:mcdonalds.com OR from:potbelly OR from:olo.com${testSenderQuery})`;
  const strictQuery = [
    baseQuery,
    "(subject:order OR subject:receipt OR subject:confirmation)",
    "-subject:promo",
    "-subject:offer",
    "-subject:deal",
    "-subject:newsletter",
  ].join(" ");

  const relaxedQuery = [baseQuery, "-subject:promo", "-subject:offer", "-subject:deal", "-subject:newsletter"].join(" ");
  const senderOnlyQuery = [senderWideQuery, "-subject:promo", "-subject:offer", "-subject:deal", "-subject:newsletter"].join(" ");

  console.log("[Orders] Gmail search", { strictQuery, relaxedQuery, senderOnlyQuery });

  const { data: strictData } = await axios.get(
    "https://www.googleapis.com/gmail/v1/users/me/messages",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { q: strictQuery, maxResults: 5, includeSpamTrash: true },
    }
  );

  const strictMessages = strictData.messages ?? [];
  const { data: relaxedData } = strictMessages.length
    ? { data: strictData }
    : await axios.get("https://www.googleapis.com/gmail/v1/users/me/messages", {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { q: relaxedQuery, maxResults: 10, includeSpamTrash: true },
      });

  const relaxedMessages = relaxedData.messages ?? [];
  const { data } = relaxedMessages.length
    ? { data: relaxedData }
    : await axios.get("https://www.googleapis.com/gmail/v1/users/me/messages", {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { q: senderOnlyQuery, maxResults: 10, includeSpamTrash: true },
      });

  const messages = data.messages ?? [];
  console.log("[Orders] Gmail raw message count", { count: messages.length });
  const results = [];

  for (const msg of messages) {
    const { data: message } = await axios.get(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { format: "full" },
      }
    );

    const headers = message.payload?.headers ?? [];
    const subject = headers.find((h: { name: string }) => h.name === "Subject")?.value ?? "";
    const from = headers.find((h: { name: string }) => h.name === "From")?.value ?? "";
    const date = headers.find((h: { name: string }) => h.name === "Date")?.value ?? "";
    const snippet = message.snippet ?? "";
    const body = extractPlainTextBody(message.payload);
    const html = extractBodyByMime(message.payload, "text/html");
    const internalDate = message.internalDate ? Number(message.internalDate) : null;

    results.push({
      id: msg.id,
      subject,
      from,
      date,
      snippet,
      body,
      html,
      internalDate,
    });
  }

  console.log("[Orders] Gmail raw messages", results.map((message) => ({
    id: message.id,
    from: message.from,
    subject: message.subject,
  })));

  const filtered = results.filter((message) =>
    isAllowedSender(message.from, allowedSenderPatterns) &&
    isLikelyOrderEmail(message.subject, message.snippet)
  );
  if (filtered.length === 0) return [];
  const sorted = filtered
    .slice()
    .sort((a, b) => (b.internalDate ?? 0) - (a.internalDate ?? 0));
  return [sorted[0]];
}

function isAllowedSender(from: string, patterns: RegExp[]) {
  const email = extractEmailAddress(from);
  if (!email) return false;
  return patterns.some((pattern) => pattern.test(email));
}

function extractEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim();
  const trimmed = value.trim();
  if (trimmed.includes("@")) return trimmed;
  return "";
}

function isLikelyOrderEmail(subject: string, snippet: string) {
  const text = `${subject} ${snippet}`.toLowerCase();
  if (text.includes("unsubscribe")) return false;
  if (text.includes("promo") || text.includes("deal") || text.includes("coupon")) return false;
  const hasStrongMarkers =
    text.includes("order confirmation") ||
    text.includes("order id") ||
    text.includes("order total") ||
    text.includes("thanks for your order") ||
    text.includes("placing a mobile order") ||
    text.includes("items:");
  const hasWeakMarkers =
    text.includes("receipt") ||
    text.includes("confirmation") ||
    text.includes("mobile order") ||
    text.includes("your order");
  return hasStrongMarkers || hasWeakMarkers;
}

function extractPlainTextBody(
  payload: { body?: { data?: string }; parts?: any[]; mimeType?: string } | undefined
): string {
  if (!payload) return "";
  const plainText = extractBodyByMime(payload, "text/plain");
  if (plainText) return plainText;
  const htmlText = extractBodyByMime(payload, "text/html");
  if (htmlText) return stripHtml(htmlText);
  return "";
}

function extractBodyByMime(
  payload: { body?: { data?: string }; parts?: any[]; mimeType?: string } | undefined,
  mimeType: string
): string {
  if (!payload) return "";
  if (payload.mimeType === mimeType && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (!payload.parts?.length) return "";
  for (const part of payload.parts) {
    if (part.mimeType?.startsWith("multipart/")) {
      const nested = extractBodyByMime(part, mimeType);
      if (nested) return nested;
      continue;
    }
    if (part.mimeType === mimeType && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    const nested = extractBodyByMime(part, mimeType);
    if (nested) return nested;
  }
  return "";
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

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + (4 - (normalized.length % 4)) % 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}
