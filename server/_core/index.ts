import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    scheduleUmdDiningScrape();
  });
}

startServer().catch(console.error);

async function scheduleUmdDiningScrape() {
  const enabled =
    process.env.ENABLE_UMD_DINING_SCRAPER === "true" ||
    (!ENV.isProduction && process.env.ENABLE_UMD_DINING_SCRAPER !== "false");
  if (!enabled) {
    console.log("[UMD Dining] Scraper disabled. Set ENABLE_UMD_DINING_SCRAPER=true to enable.");
    return;
  }

  const intervalMinutes = Number.parseInt(
    process.env.UMD_DINING_SCRAPE_INTERVAL_MINUTES || "1440",
    10
  );
  const intervalMs = Math.max(15, intervalMinutes) * 60 * 1000;
  let running = false;

  const runScrape = async (label: string) => {
    if (running) {
      console.log(`[UMD Dining] Skip ${label} scrape: already running.`);
      return;
    }
    running = true;
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) {
        console.warn("[UMD Dining] Database unavailable, skipping scrape.");
        return;
      }
      const { scrapeUmdDining } = await import("../../scripts/scrapers/umdDining.mjs");
      console.log(`[UMD Dining] Starting ${label} scrape...`);
      const added = await scrapeUmdDining({ db, date: new Date() });
      console.log(`[UMD Dining] ${label} scrape complete. Added ${added} items.`);
    } catch (error) {
      console.error(`[UMD Dining] ${label} scrape failed:`, error);
    } finally {
      running = false;
    }
  };

  await runScrape("startup");
  setInterval(() => {
    runScrape("interval");
  }, intervalMs);
}
