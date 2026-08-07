import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerMercadoPagoWebhook } from "../paymentWebhook";
import { whatsappWebhook } from "../whatsapp.webhook";

const PUBLIC_MAINTENANCE_MODE = process.env.PUBLIC_MAINTENANCE_MODE === "true";
const PUBLIC_MAINTENANCE_CONFIRMATION =
  process.env.PUBLIC_MAINTENANCE_CONFIRMATION === "CONFIRM_MAINTENANCE_MODE";

function renderMaintenancePage() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Em manutenção</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Arial, sans-serif;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #163321 0%, #f3f0e8 100%);
        color: #163321;
      }
      main {
        width: min(92vw, 720px);
        padding: 48px 32px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 24px 80px rgba(22, 51, 33, 0.18);
        text-align: center;
      }
      h1 {
        margin: 0;
        font-size: clamp(2.1rem, 6vw, 3.8rem);
        letter-spacing: 0.12em;
      }
      p {
        margin: 18px auto 0;
        max-width: 38rem;
        font-size: 1.05rem;
        line-height: 1.6;
        color: #3f5548;
      }
      .badge {
        display: inline-block;
        margin-bottom: 18px;
        padding: 8px 14px;
        border-radius: 999px;
        background: #228b22;
        color: #fff;
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.08em;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="badge">PARCERIA DO BEM</div>
      <h1>EM MANUTENÇÃO</h1>
      <p>Estamos realizando ajustes temporários para reorganizar o site com segurança. Voltaremos em breve.</p>
    </main>
  </body>
</html>`;
}

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
  const publicAppUrl = process.env.PUBLIC_APP_URL?.trim() || "https://www.parceriadobem.com.br";
  const isDevelopment = process.env.NODE_ENV === "development";

  if (process.env.NODE_ENV !== "development") {
    app.use((req, res, next) => {
      const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
      const host = (forwardedHost || req.get("host") || "").toLowerCase();
      const hostname = host.split(":")[0];

      if (hostname === "app.parceriadobem.com.br") {
        const target = new URL(publicAppUrl);
        const location = `${target.origin}${req.originalUrl}`;
        res.redirect(301, location);
        return;
      }

      next();
    });
  }

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ limit: "200mb", extended: true }));
  registerMercadoPagoWebhook(app);
  app.use("/api/whatsapp", whatsappWebhook);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (
    PUBLIC_MAINTENANCE_MODE &&
    PUBLIC_MAINTENANCE_CONFIRMATION &&
    process.env.NODE_ENV === "production"
  ) {
    app.use("*", (_req, res) => {
      res
        .status(503)
        .set({
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        })
        .end(renderMaintenancePage());
    });

    const preferredPort = parseInt(process.env.PORT || "3000");
    const strictPort = process.env.STRICT_PORT === "true";
    const port = await findAvailablePort(preferredPort);

    if (port !== preferredPort) {
      if (strictPort) {
        throw new Error(
          `Port ${preferredPort} is busy. Run "pnpm dev:clean" or free this port before starting dev.`
        );
      }

      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }

    server.listen(port, () => {
      if (isDevelopment) {
        console.log(`Running in development mode (${process.cwd()})`);
      }
      console.log(`Server running on http://localhost:${port}/`);
    });
    return;
  }

  // development mode uses Vite, production mode uses static files
  if (isDevelopment) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const strictPort = process.env.STRICT_PORT === "true";
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    if (strictPort) {
      throw new Error(
        `Port ${preferredPort} is busy. Run \"pnpm dev:clean\" or free this port before starting dev.`
      );
    }

    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    if (isDevelopment) {
      console.log(`Running in development mode (${process.cwd()})`);
    }
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
