import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { contributionsRouter } from "./contributions";
import { campaignsRouter } from "./campaigns";
import { paymentsRouter } from "./payments";
import { partnersRouter } from "./partners";
import { accountabilityRouter } from "./accountability";
import { whatsappRouter } from "./whatsapp.router";
import { siteSettingsRouter } from "./siteSettings";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  contributions: contributionsRouter,
  campaigns: campaignsRouter,
  payments: paymentsRouter,
  partners: partnersRouter,
  accountability: accountabilityRouter,
  whatsapp: whatsappRouter,
  siteSettings: siteSettingsRouter,
});

export type AppRouter = typeof appRouter;
