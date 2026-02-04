import fs from "fs";
import path from "path";
import readline from "readline";
import { parseReceiptPdfItems, parseReceiptPdfBuffer } from "./receiptPdf";

type ParsedOrderItem = {
  name: string;
  quantity: number;
};

const LOGIN_URL_HINTS = ["auth.uber.com", "login"];

export async function fetchUberReceiptItems(clickUrl: string): Promise<ParsedOrderItem[]> {
  const email = process.env.UBER_EMAIL;
  const password = process.env.UBER_PASSWORD;
  if (!email || !password) {
    console.warn("[Orders] Missing UBER_EMAIL or UBER_PASSWORD.");
    return [];
  }

  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    console.error("[Orders] Playwright not installed for Uber receipt fetch.");
    return [];
  }

  const headless = !/false/i.test(process.env.UBER_HEADLESS ?? "true");
  const storagePath = resolveStoragePath();
  const hasStorage = fs.existsSync(storagePath);

  const useChromeProfile = process.env.UBER_CHROME_PROFILE === "true";
  const chromeUserDataDir =
    process.env.UBER_CHROME_USER_DATA_DIR ||
    path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "User Data");
  const chromeProfileName = process.env.UBER_CHROME_PROFILE_NAME || "Default";
  const context = useChromeProfile
    ? await chromium.launchPersistentContext(chromeUserDataDir, {
        headless,
        channel: "chrome",
        acceptDownloads: true,
        args: [`--profile-directory=${chromeProfileName}`],
      })
    : await chromium.launch({ headless }).then((browser) =>
        browser.newContext({
          storageState: hasStorage ? storagePath : undefined,
          acceptDownloads: true,
        })
      );
  const page = context.pages()[0] ?? (await context.newPage());
  const pdfResponsePromise = waitForPdfResponse(page, 25000);
  const sessionStart = Date.now();

  try {
    if (process.env.UBER_USE_ORDERS_PAGE === "true") {
      await page.goto("https://www.ubereats.com/orders", { waitUntil: "domcontentloaded", timeout: 60000 });
    } else {
      await page.goto(clickUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    }
    if (process.env.UBER_MANUAL_LOGIN === "true") {
      await page.bringToFront();
      console.log("[Orders] Uber manual login: complete login, then press Enter in this terminal.");
      await waitForEnter();
      await page.goto("https://www.ubereats.com/orders", { waitUntil: "domcontentloaded", timeout: 60000 });
    }
    const needsLogin = await isLoginPage(page);
    if (needsLogin) {
      const loginOk = await completeLogin(page, email, password);
      if (!loginOk) {
        console.warn("[Orders] Uber login failed or needs verification.");
        return [];
      }
      await page.waitForLoadState("domcontentloaded", { timeout: 60000 });
      await clickContinueIfPresent(page);
    }

    if (!hasStorage) {
      await context.storageState({ path: storagePath });
    }

    const pdfBuffer = await downloadLatestReceiptPdf(page);
    if (pdfBuffer) {
      const items = await parseReceiptPdfBuffer(pdfBuffer);
      if (items.length > 0) return items;
    }
    const downloadedBuffer = await findRecentDownloadBuffer(sessionStart);
    if (downloadedBuffer) {
      const items = await parseReceiptPdfBuffer(downloadedBuffer);
      if (items.length > 0) return items;
    }

    const pdfUrl = await findPdfLink(page);
    if (pdfUrl) {
      const items = await parseReceiptPdfItems(pdfUrl);
      if (items.length > 0) return items;
    }

    const pdfResponse = await pdfResponsePromise;
    if (pdfResponse) {
      const buffer = Buffer.from(await pdfResponse.body());
      const items = await parseReceiptPdfBuffer(buffer);
      if (items.length > 0) return items;
    }
  } catch (error) {
    console.warn("[Orders] Failed to fetch Uber receipt", { error });
  } finally {
    if (process.env.UBER_KEEP_BROWSER_OPEN === "true") {
      console.log("[Orders] Leaving Uber browser open for manual review.");
      return [];
    }
    if (!useChromeProfile) {
      await page.close();
      await context.close();
      await context.browser()?.close();
    } else {
      await page.close();
      await context.close();
    }
  }

  return [];
}

function resolveStoragePath() {
  const fromEnv = process.env.UBER_STORAGE_PATH;
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve("server", ".uber-storage.json");
}

async function isLoginPage(page: import("playwright").Page) {
  const url = page.url();
  if (LOGIN_URL_HINTS.some((hint) => url.includes(hint))) {
    return true;
  }
  return Boolean(
    (await page.$('input[type="email"]')) ||
      (await page.$('input[name="email"]')) ||
      (await page.$('input[type="tel"]')) ||
      (await page.$('input[name="phone"]'))
  );
}

async function completeLogin(
  page: import("playwright").Page,
  email: string,
  password: string
) {
  const emailInput =
    (await page.$('input[type="email"]')) ||
    (await page.$('input[name="email"]')) ||
    (await page.$('input[type="tel"]')) ||
    (await page.$('input[name="phone"]'));
  if (!emailInput) return false;
  await emailInput.fill(email);
  await page.keyboard.press("Enter");

  const passwordInput =
    (await page.waitForSelector('input[type="password"]', { timeout: 20000 }).catch(() => null)) ||
    (await page.$('input[name="password"]'));
  if (!passwordInput) return false;
  await passwordInput.fill(password);
  await page.keyboard.press("Enter");

  const verification = await page
    .waitForSelector('input[name="verification_code"], input[name="code"]', { timeout: 8000 })
    .catch(() => null);
  if (verification) {
    console.warn("[Orders] Uber login requires verification code.");
    return false;
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 60000 });
  return true;
}

async function findPdfLink(page: import("playwright").Page) {
  const links = await page.$$eval("a", (anchors) =>
    anchors.map((anchor) => (anchor as HTMLAnchorElement).href).filter(Boolean)
  );
  const pdfLink =
    links.find((link) => /pdf/i.test(link)) ||
    links.find((link) => /download/i.test(link)) ||
    links.find((link) => /receipt/i.test(link));
  return pdfLink || null;
}

async function downloadLatestReceiptPdf(page: import("playwright").Page) {
  await dismissCookiePopup(page);
  const viewReceipt = await page
    .$(`text=View receipt`)
    .catch(() => null);
  if (!viewReceipt) return null;
  await viewReceipt.click().catch(() => null);
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => null);

  const downloadPromise = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
  const downloadButton = await page
    .$(`text="Download PDF"`)
    .catch(() => null);
  const fallbackButton = downloadButton
    ? null
    : await page.$(`text=/PDF/i`).catch(() => null);
  const buttonToClick = downloadButton ?? fallbackButton;
  if (!buttonToClick) return null;
  await buttonToClick.click().catch(() => null);
  const download = await downloadPromise;
  if (download) {
    const filePath = await download.path();
    if (filePath && fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
  }

  return null;
}

async function clickContinueIfPresent(page: import("playwright").Page) {
  const button = await page
    .$(`button:has-text("Continue"), button:has-text("continue")`)
    .catch(() => null);
  if (!button) return;
  await button.click().catch(() => null);
}

async function dismissCookiePopup(page: import("playwright").Page) {
  const button = await page
    .$(`button:has-text("Got it"), button:has-text("Accept"), button:has-text("OK")`)
    .catch(() => null);
  if (button) {
    await button.click().catch(() => null);
  }
}

async function findRecentDownloadBuffer(startTime: number) {
  const downloadsDir =
    process.env.UBER_DOWNLOADS_DIR ||
    path.join(process.env.USERPROFILE ?? "", "Downloads");
  if (!downloadsDir || !fs.existsSync(downloadsDir)) return null;
  const entries = fs.readdirSync(downloadsDir);
  const candidates = entries
    .map((entry) => {
      const fullPath = path.join(downloadsDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        return { path: fullPath, mtimeMs: stat.mtimeMs, size: stat.size };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { path: string; mtimeMs: number; size: number } => Boolean(entry))
    .filter((entry) => entry.mtimeMs >= startTime - 5000 && entry.size > 1024)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (candidates.length === 0) return null;
  const buffer = fs.readFileSync(candidates[0].path);
  const header = buffer.slice(0, 4).toString("utf8");
  if (header !== "%PDF") return null;
  return buffer;
}

function waitForEnter() {
  return new Promise<void>((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

function waitForPdfResponse(page: import("playwright").Page, timeoutMs: number) {
  return new Promise<import("playwright").Response | null>((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      resolve(null);
    }, timeoutMs);

    page.on("response", async (response) => {
      if (resolved) return;
      const contentType = (await response.headers())["content-type"] || "";
      if (contentType.includes("pdf")) {
        clearTimeout(timeout);
        resolved = true;
        resolve(response);
      }
    });
  });
}
