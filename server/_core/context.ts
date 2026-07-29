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
  id: 0,
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

  // Dev-mode fallback: when no authenticated user and the request carries the
  // X-Dev-Admin header with the expected email, use a hard-coded admin user.
  // This header is only honoured in non-production environments.
  if (!user && !ENV.isProduction) {
    const devHeader = opts.req.headers["x-dev-admin"];
    const email = typeof devHeader === "string" ? devHeader.trim().toLowerCase() : "";
    if (email && ENV.adminEmails.includes(email)) {
      user = { ...LOCAL_DEV_USER, email };
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
