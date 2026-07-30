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
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
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
