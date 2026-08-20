import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SECTIONS,
  countOwners,
  createAdminSessionToken,
  createAdminUser,
  deleteAdminUser,
  getAdminSessionCookieOptions,
  getAdminUserByEmail,
  getAdminUserById,
  listAdminUsers,
  touchAdminLastSignedIn,
  updateAdminUser,
  verifyPassword,
} from "./_core/adminAuth";
import { ownerProcedure, publicProcedure, router } from "./_core/trpc";

const sectionEnum = z.enum(ADMIN_SECTIONS);
const roleEnum = z.enum(["owner", "full", "partial"]);

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

  // Gestão de administradores — só o "owner" (administrador geral) pode ver, criar,
  // editar ou remover outros administradores.
  list: ownerProcedure.query(async () => {
    const admins = await listAdminUsers();
    return admins.map(a => ({
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role,
      allowedSections: a.allowedSections ? a.allowedSections.split(",") : [],
      createdAt: a.createdAt,
      lastSignedIn: a.lastSignedIn,
    }));
  }),

  create: ownerProcedure
    .input(
      z.object({
        email: z.string().trim().email(),
        password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres."),
        name: z.string().trim().max(255).optional(),
        role: roleEnum.default("full"),
        allowedSections: z.array(sectionEnum).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await getAdminUserByEmail(input.email);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe um administrador com esse e-mail." });
      }
      const created = await createAdminUser({
        email: input.email,
        password: input.password,
        name: input.name ?? null,
        role: input.role,
        allowedSections: input.role === "partial" ? input.allowedSections ?? [] : undefined,
      });
      return { success: true as const, id: created.id };
    }),

  update: ownerProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().max(255).optional(),
        role: roleEnum.optional(),
        allowedSections: z.array(sectionEnum).optional(),
        password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres.").optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const target = await getAdminUserById(input.id);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Administrador não encontrado." });

      // Impede rebaixar o próprio usuário logado ou o último "owner" restante,
      // o que travaria o acesso de todo mundo à gestão de administradores.
      const willDemoteFromOwner = target.role === "owner" && input.role && input.role !== "owner";
      if (willDemoteFromOwner) {
        if (target.id === ctx.adminSession!.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode remover seu próprio acesso de administrador geral." });
        }
        const owners = await countOwners();
        if (owners <= 1) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Precisa existir pelo menos um administrador geral." });
        }
      }

      await updateAdminUser(input.id, {
        name: input.name,
        role: input.role,
        allowedSections: input.role === "partial" ? input.allowedSections ?? [] : input.role ? [] : undefined,
        password: input.password,
      });
      return { success: true as const };
    }),

  remove: ownerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.adminSession!.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode excluir sua própria conta." });
      }
      const target = await getAdminUserById(input.id);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Administrador não encontrado." });
      if (target.role === "owner") {
        const owners = await countOwners();
        if (owners <= 1) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Precisa existir pelo menos um administrador geral." });
        }
      }
      await deleteAdminUser(input.id);
      return { success: true as const };
    }),
});
