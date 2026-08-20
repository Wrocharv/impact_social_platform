import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];

    // O atalho "dev-local" pula a verificação de OAuth real e loga como um
    // usuário fixo — só pode existir fora de produção. Sem essa trava,
    // qualquer visitante que acessasse esta rota entraria autenticado sem
    // senha nenhuma.
    if (code === "dev-local" && ENV.isProduction) {
      res.status(403).json({ error: "dev-local login is disabled in production" });
      return;
    }

    if (code !== "dev-local" && (!nonce || nonce !== expectedNonce)) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

    try {
      let openId = `local:${code}`;
      let name = "Usuário local";
      let email: string | null = null;

      if (code === "dev-local") {
        email = "gospeltv@gmail.com";
        openId = `local:${email}`;
        name = "Administrador local";
      } else {
        const tokenResponse = await sdk.exchangeCodeForToken(code, state);
        const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

        if (!userInfo.openId) {
          res.status(400).json({ error: "openId missing from user info" });
          return;
        }

        openId = userInfo.openId;
        name = userInfo.name || "";
        email = userInfo.email ?? null;
      }

      try {
        await db.upsertUser({
          openId,
          name,
          email,
          loginMethod: "local-dev",
          lastSignedIn: new Date(),
        });
      } catch (error) {
        console.warn("[OAuth] Failed to persist local-dev user, continuing with session creation", error);
      }

      const sessionToken = await sdk.createSessionToken(openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/admin");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
