import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { type AdminSection, hasSection } from "./adminAuth";
import type { TrpcContext } from "./context";
import { ENV } from "./env";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const readSingleHeader = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
};

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.adminSession) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    if (opts.type === "mutation" && ENV.adminChangeLockEnabled) {
      const expectedDirection = ENV.adminChangeDirection;
      if (!expectedDirection) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Trava de alteracoes ativa. Defina ADMIN_CHANGE_DIRECTION no servidor para liberar mutacoes administrativas com direcao explicita.",
        });
      }

      const providedDirection = readSingleHeader(ctx.req.headers["x-change-direction"]);
      if (providedDirection !== expectedDirection) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Trava de alteracoes ativa. Envie o header x-change-direction com a direcao aprovada para executar alteracoes administrativas.",
        });
      }
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const ownerProcedure = adminProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (ctx.adminSession?.role !== "owner") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador geral pode gerenciar outros administradores." });
    }

    return next({ ctx });
  }),
);

export function sectionProcedure(section: AdminSection) {
  return adminProcedure.use(
    t.middleware(async opts => {
      const { ctx, next } = opts;

      if (!hasSection(ctx.adminSession, section)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para esta área do painel." });
      }

      return next({ ctx });
    }),
  );
}
