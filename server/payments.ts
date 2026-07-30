import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { campaigns, contributions } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { createMercadoPagoPreference } from "./mercadopago";

const createPaymentPreferenceSchema = z.object({
  campaignId: z.number().int().positive(),
  campaignTitle: z.string().trim().max(255).optional(),
  amount: z.number().int().min(100, "Valor mínimo: R$ 1,00"),
  donorEmail: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const normalized = value.trim();
      return normalized.length === 0 ? undefined : normalized;
    },
    z.string().email().optional(),
  ),
  donorName: z.string().trim().max(255).optional().default(""),
  donorWhatsapp: z.string().trim().max(20).optional().default(""),
  donorCity: z.string().trim().max(255).optional().default(""),
  donorChurch: z.string().trim().max(255).optional().default(""),
  allowPublicDisplay: z.boolean().optional().default(false),
  numberOfInstallments: z.number().int().min(2).max(24).optional(),
  installmentFrequency: z.enum(["weekly", "biweekly", "monthly"]).optional(),
  paymentMethod: z.enum(["pix", "card", "boleto", "cash"]).optional(),
});

function requestOrigin(req: {
  protocol: string;
  get(name: string): string | undefined;
}) {
  const configuredPublicUrl = process.env.PUBLIC_APP_URL?.trim();
  if (configuredPublicUrl) {
    try {
      return new URL(configuredPublicUrl).origin;
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "PUBLIC_APP_URL inválida. Use uma URL completa, ex: https://www.parceriadobem.com.br",
      });
    }
  }

  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || req.protocol;
  const host = forwardedHost || req.get("host");

  if (!host) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Host público indisponível" });
  }

  // Mercado Pago exige URLs públicas válidas no checkout; localhost causa erro de back_url.
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return "https://www.parceriadobem.com.br";
  }

  return `${protocol}://${host}`;
}

function getReadableErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const maybeApiError = error as {
      message?: unknown;
      status?: unknown;
      cause?: Array<{ code?: string; description?: string }>;
    };

    const causeDescription = maybeApiError.cause?.[0]?.description?.trim();
    if (causeDescription) {
      return causeDescription;
    }

    const message = typeof maybeApiError.message === "string" ? maybeApiError.message.trim() : "";
    if (message.length > 0) {
      if (message.includes("UNAUTHORIZED") || maybeApiError.status === 403) {
        return "Credencial do Mercado Pago invalida ou sem permissao para criar PIX.";
      }
      return message;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
      if (maybeMessage.includes("UNAUTHORIZED")) {
        return "Credencial do Mercado Pago inválida ou sem permissão para criar PIX.";
      }
      return maybeMessage;
    }
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Não foi possível iniciar o checkout. Tente novamente.";
}

function isMercadoPagoUnauthorized(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: unknown }).code;
  const maybeStatus = (error as { status?: unknown }).status;
  return maybeCode === "PA_UNAUTHORIZED_RESULT_FROM_POLICIES" || maybeStatus === 403;
}

function isMercadoPagoNotConfigured(error: unknown) {
  const message = getReadableErrorMessage(error).toLowerCase();
  return message.includes("mercado_pago_access_token") || message.includes("não configurado") || message.includes("nao configurado");
}

function shouldUsePixDevFallback(error: unknown) {
  return isMercadoPagoUnauthorized(error) || isMercadoPagoNotConfigured(error);
}

export const paymentsRouter = router({
  createPaymentPreference: publicProcedure
    .input(createPaymentPreferenceSchema)
    .mutation(async ({ input, ctx }) => {
      const enablePixDevFallback = process.env.ENABLE_PIX_DEV_FALLBACK === "true";

      const db = await getDb();
      const donorEmail = input.donorEmail?.trim() || `doador+${randomUUID().slice(0, 8)}@parceriadobem.com`;

      if (!db) {
        try {
          const externalReference = `pdb-${input.campaignId}-${randomUUID()}`;
          const fallbackCampaignTitle = input.campaignTitle?.trim() || `Campanha ${input.campaignId}`;
          const preference = await createMercadoPagoPreference({
            campaignId: input.campaignId,
            campaignTitle: fallbackCampaignTitle,
            amountCents: input.amount,
            donorEmail,
            donorName: input.donorName?.trim() || "Doador",
            externalReference,
            baseUrl: requestOrigin(ctx.req),
          });

          return {
            checkoutUrl: preference.checkoutUrl,
            contributionId: undefined,
            preferenceId: preference.id,
            environment: preference.environment,
          };
        } catch (error) {
          if (!ENV.isProduction && enablePixDevFallback && shouldUsePixDevFallback(error)) {
            const origin = requestOrigin(ctx.req);
            const fallbackCampaignTitle = input.campaignTitle?.trim() || `Campanha ${input.campaignId}`;
            return {
              checkoutUrl: `${origin}/contribute/confirmation?type=financial&campaign=${encodeURIComponent(fallbackCampaignTitle)}&campaignId=${input.campaignId}&donor=${encodeURIComponent(input.donorName?.trim() || "Doador")}&amount=${input.amount}`,
              contributionId: undefined,
              preferenceId: "dev-fallback",
              environment: "test" as const,
            };
          }

          const message = getReadableErrorMessage(error);
          console.error("[MercadoPago] Falha ao criar preferência sem banco", error);
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message,
          });
        }
      }

      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.id, input.campaignId), eq(campaigns.status, "active")))
        .limit(1);

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campanha ativa não encontrada" });
      }

      const externalReference = `pdb-${input.campaignId}-${randomUUID()}`;
      const donorName = input.donorName?.trim() ?? "";
      const donorWhatsapp = input.donorWhatsapp?.trim() ?? "";
      const donorCity = input.donorCity?.trim() ?? "";
      const donorChurch = input.donorChurch?.trim() ?? "";
      const allowPublicDisplay = input.allowPublicDisplay ?? false;

      await db.insert(contributions).values({
        campaignId: campaign.id,
        userId: ctx.user?.id,
        type: "financial",
        amount: input.amount,
        donorName,
        donorEmail,
        donorWhatsapp,
        donorCity,
        donorChurch,
        allowPublicDisplay,
        numberOfInstallments: input.numberOfInstallments,
        installmentFrequency: input.installmentFrequency,
        paymentMethod: input.paymentMethod,
        status: "pending",
        externalReference,
        paymentStatusDetail: "preference_creating",
      });

      try {
        const preference = await createMercadoPagoPreference({
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          amountCents: input.amount,
          donorEmail,
          donorName,
          externalReference,
          baseUrl: requestOrigin(ctx.req),
        });

        await db
          .update(contributions)
          .set({
            preferenceId: preference.id,
            paymentStatusDetail: "preference_created",
            updatedAt: new Date(),
          })
          .where(eq(contributions.externalReference, externalReference));

        const [contribution] = await db
          .select({ id: contributions.id })
          .from(contributions)
          .where(eq(contributions.externalReference, externalReference))
          .limit(1);

        return {
          checkoutUrl: preference.checkoutUrl,
          contributionId: contribution?.id,
          preferenceId: preference.id,
          environment: preference.environment,
        };
      } catch (error) {
        if (!ENV.isProduction && enablePixDevFallback && shouldUsePixDevFallback(error)) {
          const origin = requestOrigin(ctx.req);
          return {
            checkoutUrl: `${origin}/contribute/confirmation?type=financial&campaign=${encodeURIComponent(campaign.title)}&campaignId=${campaign.id}&donor=${encodeURIComponent(donorName || "Doador")}&amount=${input.amount}`,
            contributionId: undefined,
            preferenceId: "dev-fallback",
            environment: "test" as const,
          };
        }

        await db
          .update(contributions)
          .set({
            status: "cancelled",
            paymentStatusDetail: "preference_creation_failed",
            updatedAt: new Date(),
          })
          .where(eq(contributions.externalReference, externalReference));

        const message = getReadableErrorMessage(error);
        console.error("[MercadoPago] Falha ao criar preferência", error);
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message,
        });
      }
    }),
});
