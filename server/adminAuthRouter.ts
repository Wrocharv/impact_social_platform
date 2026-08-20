import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  getAdminUserByEmail,
  touchAdminLastSignedIn,
  verifyPassword,
} from "./_core/adminAuth";
import { publicProcedure, router } from "./_core/trpc";

// Proteção simples contra força bruta: limita tentativas por e-mail em memória.
// Reseta ao reiniciar o servidor — suficiente para um painel de baixo tráfego.
const failedAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000; // 15 minutos

function isBlocked(email: string): boolean {
  const entry = failedAttempts.get(email);
  if (!entry) return false;
  if (entry.blockedUntil && entry.blockedUntil > Date.now()) return true;
  if (entry.blockedUntil && entry.blockedUntil <= Date.now()) {
    failedAttempts.delete(email);
  }
  return false;
}

function registerFailure(email: string) {
  const entry = failedAttempts.get(email) ?? { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_MS;
    entry.count = 0;
  }
  failedAttempts.set(email, entry);
}

function clearFailures(email: string) {
  failedAttempts.delete(email);
}

export const adminAuthRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.adminSession ?? null),

  login: publicProcedure
    .input(z.object({ email: z.string().trim().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const email = input.email.trim().toLowerCase();

      if (isBlocked(email)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Muitas tentativas incorretas. Tente novamente em alguns minutos.",
        });
      }

      const admin = await getAdminUserByEmail(email);
      if (!admin || !verifyPassword(input.password, admin.passwordHash)) {
        registerFailure(email);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha incorretos." });
      }

      clearFailures(email);
      await touchAdminLastSignedIn(admin.id);

      const token = await createAdminSessionToken(admin);
      ctx.res.cookie(ADMIN_COOKIE_NAME, token, getAdminSessionCookieOptions(ctx.req));

      return { success: true as const, email: admin.email, name: admin.name };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(ADMIN_COOKIE_NAME, { ...getAdminSessionCookieOptions(ctx.req), maxAge: -1 });
    return { success: true as const };
  }),
});
