import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const LOCAL_DEV_USER: User = {
  id: 1,
  openId: "local:gospeltv@gmail.com",
  name: "Administrador local",
  email: "gospeltv@gmail.com",
  loginMethod: "local-dev",
  role: "admin",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(0),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Dev-mode fallback (opt-in): only when explicitly enabled and the request
  // carries a valid X-Dev-Admin header.
  if (!user && !ENV.isProduction && process.env.ENABLE_LOCAL_DEV_AUTH === "1") {
    const devFallbackEmail = ENV.adminEmails[0] ?? LOCAL_DEV_USER.email ?? "gospeltv@gmail.com";
    const devHeader = opts.req.headers["x-dev-admin"];
    const email = typeof devHeader === "string" ? devHeader.trim().toLowerCase() : "";
    if (email && ENV.adminEmails.includes(email)) {
      user = { ...LOCAL_DEV_USER, email };
    } else if (email && email === devFallbackEmail) {
      user = { ...LOCAL_DEV_USER, email };
    }
  }

  // Local fallback mode: when running without DATABASE_URL on localhost,
  // allow admin operations in the local panel even in production build.
  if (!user && !process.env.DATABASE_URL) {
    const hostHeader = String(opts.req.headers.host ?? "").toLowerCase();
    const isLocalHost = hostHeader.includes("localhost") || hostHeader.includes("127.0.0.1");

    if (isLocalHost) {
      const email = ENV.adminEmails[0] ?? LOCAL_DEV_USER.email;
      user = { ...LOCAL_DEV_USER, email };
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
