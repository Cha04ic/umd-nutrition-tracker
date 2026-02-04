import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import axios from "axios";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { buildGmailAuthUrl, exchangeGmailCode, fetchGmailProfile } from "../services/gmail";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function decodeState(state: string | undefined, req: Request): string {
  if (!state) {
    return `${req.protocol}://${req.get("host")}/api/oauth/callback`;
  }
  try {
    return atob(state);
  } catch {
    return `${req.protocol}://${req.get("host")}/api/oauth/callback`;
  }
}

function decodeJsonState(state: string | undefined): { openId?: string; redirect?: string } {
  if (!state) return {};
  try {
    const raw = atob(state);
    return JSON.parse(raw) as { openId?: string; redirect?: string };
  } catch {
    return {};
  }
}

function getRedirectUri(req: Request, fallbackPath: string) {
  return (
    ENV.gmailRedirectUri ||
    `${req.protocol}://${req.get("host")}${fallbackPath}`
  );
}

async function exchangeGoogleCodeForToken(code: string, redirectUri: string) {
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("client_id", ENV.googleClientId);
  params.set("client_secret", ENV.googleClientSecret);
  params.set("redirect_uri", redirectUri);
  params.set("grant_type", "authorization_code");

  const { data } = await axios.post(
    "https://oauth2.googleapis.com/token",
    params,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  return data as { access_token: string };
}

async function getGoogleUserInfo(accessToken: string) {
  const { data } = await axios.get(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data as { sub: string; name?: string; email?: string };
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/gmail/connect", async (req: Request, res: Response) => {
    if (!ENV.gmailClientId || !ENV.gmailClientSecret) {
      res.status(500).json({ error: "Gmail OAuth is not configured" });
      return;
    }

    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const sessionToken = cookies[COOKIE_NAME];
    const session = await sdk.verifySession(sessionToken);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const statePayload = {
      openId: session.openId,
      redirect: "/profile",
    };
    const state = btoa(JSON.stringify(statePayload));
    const redirectUri = getRedirectUri(req, "/api/gmail/callback");
    const authUrl = buildGmailAuthUrl(redirectUri, state);
    res.redirect(authUrl);
  });

  app.get("/api/gmail/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code) {
      res.status(400).json({ error: "code is required" });
      return;
    }

    if (!ENV.gmailClientId || !ENV.gmailClientSecret) {
      res.status(500).json({ error: "Gmail OAuth is not configured" });
      return;
    }

    const decoded = decodeJsonState(state);
    if (!decoded.openId) {
      res.status(400).json({ error: "Invalid state" });
      return;
    }

    try {
      const redirectUri = getRedirectUri(req, "/api/gmail/callback");
      const token = await exchangeGmailCode(code, redirectUri);
      const profile = await fetchGmailProfile(token.access_token);
      const user = await db.getUserByOpenId(decoded.openId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      await db.upsertConnectedAccount(user.id, "gmail", {
        platformAccountId: profile.emailAddress ?? null,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
        isActive: 1,
      });

      res.redirect(decoded.redirect || "/profile");
    } catch (error) {
      console.error("[Gmail OAuth] Callback failed", error);
      res.status(500).json({ error: "Gmail OAuth callback failed" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      if (!ENV.googleClientId || !ENV.googleClientSecret) {
        res.status(500).json({ error: "Google OAuth is not configured" });
        return;
      }

      const redirectUri = decodeState(state, req);
      const tokenResponse = await exchangeGoogleCodeForToken(code, redirectUri);
      const googleUser = await getGoogleUserInfo(tokenResponse.access_token);
      const resolvedName = googleUser.name || googleUser.email || "Google User";
      const userInfo: {
        openId: string;
        name?: string;
        email?: string;
        loginMethod?: string;
      } = {
        openId: googleUser.sub,
        name: resolvedName,
        email: googleUser.email,
        loginMethod: "google",
      };

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      const existingUser = await db.getUserByOpenId(userInfo.openId);
      const resolvedDbName = existingUser?.name ?? userInfo.name ?? null;
      const resolvedEmail = existingUser?.email ?? userInfo.email ?? null;

      await db.upsertUser({
        openId: userInfo.openId,
        name: resolvedDbName,
        email: resolvedEmail,
        loginMethod: userInfo.loginMethod ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        email: userInfo.email ?? undefined,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      console.log("[OAuth] Session cookie set", {
        openId: userInfo.openId,
        email: userInfo.email ?? null,
        sameSite: cookieOptions.sameSite,
        secure: cookieOptions.secure,
      });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
