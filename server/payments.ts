import { TRPCError } from "@trpc/server";
import { and, eq, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { campaigns, contributions } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { publicProcedure, router } from "./_core/trpc";
import { createFallbackCashContribution } from "./cashValidationFallback";
import { getDb } from "./db";
import { createMercadoPagoPreference, getMercadoPagoPayment } from "./mercadopago";

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
  donorCpf: z.string().trim().max(14).optional().default(""),
  donorWhatsapp: z.string().trim().max(20).optional().default(""),
  donorCity: z.string().trim().max(255).optional().default(""),
  donorChurch: z.string().trim().max(255).optional().default(""),
  allowPublicDisplay: z.boolean().optional().default(false),
  numberOfInstallments: z.number().int().min(2).max(24).optional(),
  installmentFrequency: z.enum(["weekly", "biweekly", "monthly"]).optional(),
  paymentMethod: z.enum(["pix", "card", "boleto", "cash"]).optional(),
});

const syncPaymentStatusSchema = z.object({
  paymentId: z.string().trim().min(1).optional(),
  externalReference: z.string().trim().min(6).optional(),
  preferenceId: z.string().trim().min(3).optional(),
});

type ContributionStatus =
  | "pending"
  | "approved"
  | "completed"
  | "rejected"
  | "cancelled"
  | "refunded";

function mapMercadoPagoStatus(status?: string): ContributionStatus {
  switch (status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return "pending";
  }
}

function amountToCents(amount?: number) {
  if (amount === undefined || !Number.isFinite(amount)) return undefined;
  return Math.round(amount * 100);
}

function normalizeCpf(value?: string | null) {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : undefined;
}

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

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isMercadoPagoUnauthorized(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: unknown }).code;
  const maybeStatus = (error as { status?: unknown }).status;
  const rawMessage = getReadableErrorMessage(error);
  const message = normalizeForMatch(rawMessage);

  return (
    maybeCode === "PA_UNAUTHORIZED_RESULT_FROM_POLICIES" ||
    maybeStatus === 403 ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("credencial do mercado pago invalida") ||
    message.includes("sem permissao para criar pix")
  );
}

function isMercadoPagoNotConfigured(error: unknown) {
  const message = getReadableErrorMessage(error).toLowerCase();
  return message.includes("mercado_pago_access_token") || message.includes("não configurado") || message.includes("nao configurado");
}

function shouldUsePixDevFallback(error: unknown) {
  return isMercadoPagoUnauthorized(error) || isMercadoPagoNotConfigured(error);
}

function shouldUsePixOperationalFallback(input: { paymentMethod?: "pix" | "card" | "boleto" | "cash" }, error: unknown) {
  if (input.paymentMethod !== "pix") return false;
  return isMercadoPagoUnauthorized(error) || isMercadoPagoNotConfigured(error);
}

function isMissingColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: unknown; code?: unknown; sqlMessage?: unknown; cause?: unknown };

  if (candidate.code === "ER_BAD_FIELD_ERROR") return true;
  if (typeof candidate.message === "string" && candidate.message.includes("Unknown column")) return true;
  if (typeof candidate.sqlMessage === "string" && candidate.sqlMessage.includes("Unknown column")) return true;

  if (candidate.cause && typeof candidate.cause === "object") {
    return isMissingColumnError(candidate.cause);
  }

  return false;
}

async function tryInsertCashLegacy(
  db: { execute: (query: unknown) => Promise<unknown> },
  input: {
    campaignId: number;
    amount: number;
    donorName: string;
    donorEmail: string;
    externalReference: string;
  },
) {
  const attempts = [
    sql`insert into contributions (campaignId, type, amount, donorName, donorEmail, status, externalReference, paymentMethod, paymentStatusDetail) values (${input.campaignId}, ${"financial"}, ${input.amount}, ${input.donorName}, ${input.donorEmail}, ${"pending"}, ${input.externalReference}, ${"cash"}, ${"awaiting_cash_confirmation"})`,
    sql`insert into contributions (campaignId, type, amount, donorName, donorEmail, status, externalReference, paymentStatusDetail) values (${input.campaignId}, ${"financial"}, ${input.amount}, ${input.donorName}, ${input.donorEmail}, ${"pending"}, ${input.externalReference}, ${"awaiting_cash_confirmation"})`,
    sql`insert into contributions (campaignId, type, amount, donorName, donorEmail, status, externalReference, paymentMethod) values (${input.campaignId}, ${"financial"}, ${input.amount}, ${input.donorName}, ${input.donorEmail}, ${"pending"}, ${input.externalReference}, ${"cash"})`,
    sql`insert into contributions (campaignId, type, amount, donorName, donorEmail, status, externalReference) values (${input.campaignId}, ${"financial"}, ${input.amount}, ${input.donorName}, ${input.donorEmail}, ${"pending"}, ${input.externalReference})`,
    sql`insert into contributions (campaignId, type, amount, donorName, donorEmail, status) values (${input.campaignId}, ${"financial"}, ${input.amount}, ${input.donorName}, ${input.donorEmail}, ${"pending"})`,
    sql`insert into contributions (campaignId, type, amount, donorName, donorEmail) values (${input.campaignId}, ${"financial"}, ${input.amount}, ${input.donorName}, ${input.donorEmail})`,
    sql`insert into contributions (campaignId, type, amount, donorName) values (${input.campaignId}, ${"financial"}, ${input.amount}, ${input.donorName})`,
    sql`insert into contributions (campaignId, type, amount) values (${input.campaignId}, ${"financial"}, ${input.amount})`,
  ];

  for (const attempt of attempts) {
    try {
      await db.execute(attempt);
      return true;
    } catch (error) {
      if (!isMissingColumnError(error)) {
        throw error;
      }
    }
  }

  return false;
}

async function tryUpdatePaymentLegacy(
  db: { execute: (query: unknown) => Promise<unknown> },
  input: {
    contributionId: number;
    status: ContributionStatus;
    paymentId: string;
    paidAt: Date | null;
  },
) {
  const attempts = [
    sql`update contributions set status = ${input.status}, paymentId = ${input.paymentId}, paidAt = ${input.paidAt}, updatedAt = ${new Date()} where id = ${input.contributionId}`,
    sql`update contributions set status = ${input.status}, paymentId = ${input.paymentId}, updatedAt = ${new Date()} where id = ${input.contributionId}`,
    sql`update contributions set status = ${input.status}, paymentId = ${input.paymentId} where id = ${input.contributionId}`,
    sql`update contributions set status = ${input.status} where id = ${input.contributionId}`,
  ];

  for (const attempt of attempts) {
    try {
      await db.execute(attempt);
      return true;
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
    }
  }

  return false;
}

async function tryInsertApprovedPaymentLegacy(
  db: { execute: (query: unknown) => Promise<unknown> },
  input: {
    campaignId: number;
    amount: number;
    externalReference: string;
    paymentId: string;
    paidAt: Date | null;
  },
) {
  const attempts = [
    sql`insert into contributions (campaignId, type, amount, donorName, status, externalReference, paymentId, paidAt) values (${input.campaignId}, ${"financial"}, ${input.amount}, ${"Doador"}, ${"approved"}, ${input.externalReference}, ${input.paymentId}, ${input.paidAt})`,
    sql`insert into contributions (campaignId, type, amount, donorName, status, externalReference, paymentId) values (${input.campaignId}, ${"financial"}, ${input.amount}, ${"Doador"}, ${"approved"}, ${input.externalReference}, ${input.paymentId})`,
    sql`insert into contributions (campaignId, type, amount, donorName, status, externalReference) values (${input.campaignId}, ${"financial"}, ${input.amount}, ${"Doador"}, ${"approved"}, ${input.externalReference})`,
  ];

  for (const attempt of attempts) {
    try {
      await db.execute(attempt);
      return true;
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
    }
  }

  return false;
}

function campaignIdFromExternalReference(externalReference: string | null | undefined) {
  const match = externalReference?.match(/^pdb-(\d+)-[a-z0-9-]+$/i);
  if (!match) return null;
  const campaignId = Number(match[1]);
  return Number.isSafeInteger(campaignId) && campaignId > 0 ? campaignId : null;
}

function buildContributionConfirmationUrl(input: {
  baseUrl: string;
  campaignId: number;
  campaignTitle: string;
  donorName: string;
  amountCents: number;
  paymentMethod?: "pix" | "card" | "boleto" | "cash";
  paymentStatus?: "awaiting_validation";
}) {
  const params = new URLSearchParams({
    type: "financial",
    campaign: input.campaignTitle,
    campaignId: String(input.campaignId),
    donor: input.donorName || "Doador",
    amount: String(input.amountCents),
  });

  if (input.paymentMethod) {
    params.set("paymentMethod", input.paymentMethod);
  }

  if (input.paymentStatus) {
    params.set("paymentStatus", input.paymentStatus);
  }

  return `${input.baseUrl}/contribute/confirmation?${params.toString()}`;
}

function buildPaymentPendingUrl(baseUrl: string) {
  return `${baseUrl}/payment/pending`;
}

export const paymentsRouter = router({
  createPaymentPreference: publicProcedure
    .input(createPaymentPreferenceSchema)
    .mutation(async ({ input, ctx }) => {
      const enablePixDevFallback = process.env.ENABLE_PIX_DEV_FALLBACK === "true";
      const enablePixOperationalFallback = process.env.ENABLE_PIX_OPERATIONAL_FALLBACK === "true";
      const isCashPayment = input.paymentMethod === "cash";

      const db = await getDb();
      const donorEmail = input.donorEmail?.trim() || `doador+${randomUUID().slice(0, 8)}@parceriadobem.com`;
      const donorName = input.donorName?.trim() || "Doador";
      const donorCpf = normalizeCpf(input.donorCpf);
      const donorWhatsapp = input.donorWhatsapp?.trim() ?? "";
      const donorCity = input.donorCity?.trim() ?? "";
      const donorChurch = input.donorChurch?.trim() ?? "";
      const allowPublicDisplay = input.allowPublicDisplay ?? false;

      if (!db) {
        if (isCashPayment) {
          if (ENV.isProduction) {
            throw new TRPCError({
              code: "SERVICE_UNAVAILABLE",
              message: "Não foi possível registrar a doação em dinheiro para validação presencial. Tente novamente em instantes.",
            });
          }

          const origin = requestOrigin(ctx.req);
          const fallbackCampaignTitle = input.campaignTitle?.trim() || `Campanha ${input.campaignId}`;
          const fallbackContribution = createFallbackCashContribution({
            campaignId: input.campaignId,
            amount: input.amount,
            donorName,
            donorCpf,
            donorEmail,
            donorWhatsapp: input.donorWhatsapp,
            donorCity: input.donorCity,
            donorChurch,
            allowPublicDisplay,
          });

          return {
            checkoutUrl: buildContributionConfirmationUrl({
              baseUrl: origin,
              campaignId: input.campaignId,
              campaignTitle: fallbackCampaignTitle,
              donorName,
              amountCents: input.amount,
              paymentMethod: "cash",
              paymentStatus: "awaiting_validation",
            }),
            contributionId: fallbackContribution.id,
            preferenceId: "cash-manual",
            environment: "test" as const,
          };
        }

        try {
          const externalReference = `pdb-${input.campaignId}-${randomUUID()}`;
          const fallbackCampaignTitle = input.campaignTitle?.trim() || `Campanha ${input.campaignId}`;
          const preference = await createMercadoPagoPreference({
            campaignId: input.campaignId,
            campaignTitle: fallbackCampaignTitle,
            amountCents: input.amount,
            paymentMethod: input.paymentMethod === "cash" ? undefined : input.paymentMethod,
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
          if (shouldUsePixOperationalFallback(input, error)) {
            const origin = requestOrigin(ctx.req);
            return {
              checkoutUrl: buildPaymentPendingUrl(origin),
              contributionId: undefined,
              preferenceId: "pix-credential-fallback",
              environment: "test" as const,
            };
          }

          if (!ENV.isProduction && enablePixDevFallback && shouldUsePixDevFallback(error)) {
            const origin = requestOrigin(ctx.req);
            const fallbackCampaignTitle = input.campaignTitle?.trim() || `Campanha ${input.campaignId}`;
            return {
              checkoutUrl: buildContributionConfirmationUrl({
                baseUrl: origin,
                campaignId: input.campaignId,
                campaignTitle: fallbackCampaignTitle,
                donorName: input.donorName?.trim() || "Doador",
                amountCents: input.amount,
              }),
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
        .select({
          id: campaigns.id,
          title: campaigns.title,
          status: campaigns.status,
        })
        .from(campaigns)
        .where(and(eq(campaigns.id, input.campaignId), eq(campaigns.status, "active")))
        .limit(1);

      if (!campaign && input.campaignId >= 100000) {
        const externalReference = `pdb-${input.campaignId}-${randomUUID()}`;
        const fallbackCampaignTitle = input.campaignTitle?.trim() || `Campanha ${input.campaignId}`;
        const origin = requestOrigin(ctx.req);

        if (isCashPayment) {
          const donorName = input.donorName?.trim() || "Doador";
          const donorCpf = normalizeCpf(input.donorCpf);
          const donorWhatsapp = input.donorWhatsapp?.trim() ?? "";
          const donorCity = input.donorCity?.trim() ?? "";
          const donorChurch = input.donorChurch?.trim() ?? "";
          const allowPublicDisplay = input.allowPublicDisplay ?? false;

          let persistedContribution = false;
          let persistError: unknown;

          try {
            await db.insert(contributions).values({
              campaignId: input.campaignId,
              userId: ctx.user?.id,
              type: "financial",
              amount: input.amount,
              donorName,
              donorCpf,
              donorEmail,
              donorWhatsapp,
              donorCity,
              donorChurch,
              allowPublicDisplay,
              paymentMethod: "cash",
              status: "pending",
              externalReference,
              paymentStatusDetail: "awaiting_cash_confirmation",
            });
            persistedContribution = true;
          } catch (error) {
            persistError = error;
            if (isMissingColumnError(error)) {
              try {
                const legacyPersisted = await tryInsertCashLegacy(db as { execute: (query: unknown) => Promise<unknown> }, {
                  campaignId: input.campaignId,
                  amount: input.amount,
                  donorName,
                  donorEmail,
                  externalReference,
                });
                if (legacyPersisted) {
                  persistedContribution = true;
                  persistError = undefined;
                }
              } catch (legacyError) {
                persistError = legacyError;
              }
            }
          }

          if (persistedContribution) {
            let contribution: { id: number } | undefined;
            try {
              contribution = (
                await db
                  .select({ id: contributions.id })
                  .from(contributions)
                  .where(eq(contributions.externalReference, externalReference))
                  .limit(1)
              )[0];
            } catch {
              contribution = undefined;
            }

            return {
              checkoutUrl: buildContributionConfirmationUrl({
                baseUrl: origin,
                campaignId: input.campaignId,
                campaignTitle: fallbackCampaignTitle,
                donorName,
                amountCents: input.amount,
                paymentMethod: "cash",
                paymentStatus: "awaiting_validation",
              }),
              contributionId: contribution?.id,
              preferenceId: "cash-fallback-campaign-db",
              environment: ENV.isProduction ? "production" as const : "test" as const,
            };
          }

          if (ENV.isProduction) {
            throw new TRPCError({
              code: "SERVICE_UNAVAILABLE",
              message: "Não foi possível registrar a doação em dinheiro para validação presencial. Tente novamente em instantes.",
              cause: persistError,
            });
          }

          console.error("[Payments] Fallback cash persistência no banco falhou; usando arquivo local", persistError);
          const fallbackContribution = createFallbackCashContribution({
            campaignId: input.campaignId,
            amount: input.amount,
            donorName,
            donorCpf,
            donorEmail,
            donorWhatsapp: input.donorWhatsapp,
            donorCity: input.donorCity,
            donorChurch,
            allowPublicDisplay,
          });

          return {
            checkoutUrl: buildContributionConfirmationUrl({
              baseUrl: origin,
              campaignId: input.campaignId,
              campaignTitle: fallbackCampaignTitle,
              donorName,
              amountCents: input.amount,
              paymentMethod: "cash",
              paymentStatus: "awaiting_validation",
            }),
            contributionId: fallbackContribution.id,
            preferenceId: "cash-fallback-campaign",
            environment: ENV.isProduction ? "production" as const : "test" as const,
          };
        }

        try {
          const preference = await createMercadoPagoPreference({
            campaignId: input.campaignId,
            campaignTitle: fallbackCampaignTitle,
            amountCents: input.amount,
            paymentMethod: input.paymentMethod === "cash" ? undefined : input.paymentMethod,
            donorEmail,
            donorName: input.donorName?.trim() || "Doador",
            externalReference,
            baseUrl: origin,
          });

          return {
            checkoutUrl: preference.checkoutUrl,
            contributionId: undefined,
            preferenceId: preference.id,
            environment: preference.environment,
          };
        } catch (error) {
          if (shouldUsePixOperationalFallback(input, error)) {
            return {
              checkoutUrl: buildPaymentPendingUrl(origin),
              contributionId: undefined,
              preferenceId: "pix-credential-fallback",
              environment: "test" as const,
            };
          }

          if (!ENV.isProduction && enablePixDevFallback && shouldUsePixDevFallback(error)) {
            return {
              checkoutUrl: buildContributionConfirmationUrl({
                baseUrl: origin,
                campaignId: input.campaignId,
                campaignTitle: fallbackCampaignTitle,
                donorName: input.donorName?.trim() || "Doador",
                amountCents: input.amount,
              }),
              contributionId: undefined,
              preferenceId: "dev-fallback",
              environment: "test" as const,
            };
          }

          const message = getReadableErrorMessage(error);
          console.error("[MercadoPago] Falha ao criar preferência para campanha fallback", error);
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message,
          });
        }
      }

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campanha ativa não encontrada" });
      }

      const externalReference = `pdb-${input.campaignId}-${randomUUID()}`;
      let persistedContribution = false;
      let persistError: unknown;

      try {
        await db.insert(contributions).values({
          campaignId: campaign.id,
          userId: ctx.user?.id,
          type: "financial",
          amount: input.amount,
          donorName,
          donorCpf,
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
          paymentStatusDetail: isCashPayment ? "awaiting_cash_confirmation" : "preference_creating",
        });
        persistedContribution = true;
      } catch (error) {
        persistError = error;
        if (isCashPayment && isMissingColumnError(error)) {
          try {
            // Compatibilidade com schema legado em produção: usa SQL explícito para evitar colunas inexistentes do schema local.
            const legacyPersisted = await tryInsertCashLegacy(db as { execute: (query: unknown) => Promise<unknown> }, {
              campaignId: campaign.id,
              amount: input.amount,
              donorName,
              donorEmail,
              externalReference,
            });
            if (legacyPersisted) {
              persistedContribution = true;
              persistError = undefined;
            }
          } catch (legacyError) {
            persistError = legacyError;
          }
        }

        if (!persistedContribution) {
          console.error("[Payments] Falha ao persistir contribuição, seguindo com checkout sem registro local", persistError ?? error);
        }
      }

      if (isCashPayment) {
        if (!persistedContribution) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "Não foi possível registrar a doação em dinheiro para validação presencial. Tente novamente em instantes.",
            cause: persistError,
          });
        }

        let contribution: { id: number } | undefined;
        try {
          contribution = (
            await db
              .select({ id: contributions.id })
              .from(contributions)
              .where(eq(contributions.externalReference, externalReference))
              .limit(1)
          )[0];
        } catch {
          contribution = undefined;
        }
        const origin = requestOrigin(ctx.req);

        return {
          checkoutUrl: buildContributionConfirmationUrl({
            baseUrl: origin,
            campaignId: campaign.id,
            campaignTitle: campaign.title,
            donorName: donorName || "Doador",
            amountCents: input.amount,
            paymentMethod: "cash",
            paymentStatus: "awaiting_validation",
          }),
          contributionId: contribution?.id,
          preferenceId: "cash-manual",
          environment: ENV.isProduction ? "production" as const : "test" as const,
        };
      }

      try {
        const preference = await createMercadoPagoPreference({
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          amountCents: input.amount,
          paymentMethod: input.paymentMethod === "cash" ? undefined : input.paymentMethod,
          donorEmail,
          donorName,
          externalReference,
          baseUrl: requestOrigin(ctx.req),
        });

        if (persistedContribution) {
          await db
            .update(contributions)
            .set({
              preferenceId: preference.id,
              paymentStatusDetail: "preference_created",
              updatedAt: new Date(),
            })
            .where(eq(contributions.externalReference, externalReference));
        }

        const contribution = persistedContribution
          ? (
              await db
                .select({ id: contributions.id })
                .from(contributions)
                .where(eq(contributions.externalReference, externalReference))
                .limit(1)
            )[0]
          : undefined;

        return {
          checkoutUrl: preference.checkoutUrl,
          contributionId: contribution?.id,
          preferenceId: preference.id,
          environment: preference.environment,
        };
      } catch (error) {
        if (shouldUsePixOperationalFallback(input, error)) {
          const origin = requestOrigin(ctx.req);
          return {
            checkoutUrl: buildPaymentPendingUrl(origin),
            contributionId: undefined,
            preferenceId: "pix-credential-fallback",
            environment: "test" as const,
          };
        }

        if (!ENV.isProduction && enablePixDevFallback && shouldUsePixDevFallback(error)) {
          const origin = requestOrigin(ctx.req);
          return {
            checkoutUrl: buildContributionConfirmationUrl({
              baseUrl: origin,
              campaignId: campaign.id,
              campaignTitle: campaign.title,
              donorName: donorName || "Doador",
              amountCents: input.amount,
            }),
            contributionId: undefined,
            preferenceId: "dev-fallback",
            environment: "test" as const,
          };
        }

        if (persistedContribution) {
          await db
            .update(contributions)
            .set({
              status: "cancelled",
              paymentStatusDetail: "preference_creation_failed",
              updatedAt: new Date(),
            })
            .where(eq(contributions.externalReference, externalReference));
        }

        const message = getReadableErrorMessage(error);
        console.error("[MercadoPago] Falha ao criar preferência", error);
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message,
        });
      }
    }),

  syncPaymentStatus: publicProcedure
    .input(syncPaymentStatusSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      }

      let resolvedPaymentId = input.paymentId;
      let resolvedExternalReference = input.externalReference;

      if (resolvedPaymentId) {
        try {
          const payment = await getMercadoPagoPayment(resolvedPaymentId);
          resolvedExternalReference = payment.external_reference ?? resolvedExternalReference;

          const status = mapMercadoPagoStatus(payment.status);
          const paidAt = status === "approved" && payment.date_approved
            ? new Date(payment.date_approved)
            : null;
          const paymentMethod = [payment.payment_type_id, payment.payment_method_id]
            .filter(Boolean)
            .join(":") || null;

          const conditions = [
            resolvedExternalReference ? eq(contributions.externalReference, resolvedExternalReference) : undefined,
            input.preferenceId ? eq(contributions.preferenceId, input.preferenceId) : undefined,
          ].filter(Boolean);

          if (conditions.length === 0) {
            return {
              success: true,
              synced: false,
              credited: false,
              status,
              reason: "contribution_not_found",
            } as const;
          }

          const [contribution] = await db
            .select({
              id: contributions.id,
              campaignId: contributions.campaignId,
              amount: contributions.amount,
              status: contributions.status,
              externalReference: contributions.externalReference,
            })
            .from(contributions)
            .where(and(eq(contributions.type, "financial"), or(...conditions)))
            .limit(1);

          const paidAmount = amountToCents(payment.transaction_amount);

          if (!contribution || contribution.amount === null) {
            const campaignId = campaignIdFromExternalReference(resolvedExternalReference);
            if (
              status === "approved"
              && payment.currency_id === "BRL"
              && typeof paidAmount === "number"
              && paidAmount > 0
              && campaignId !== null
              && typeof resolvedExternalReference === "string"
            ) {
              const inserted = await tryInsertApprovedPaymentLegacy(
                db as { execute: (query: unknown) => Promise<unknown> },
                {
                  campaignId,
                  amount: paidAmount,
                  externalReference: resolvedExternalReference,
                  paymentId: String(payment.id),
                  paidAt,
                },
              );

              if (inserted) {
                return {
                  success: true,
                  synced: true,
                  credited: true,
                  status,
                  campaignId,
                  amount: paidAmount,
                  externalReference: resolvedExternalReference,
                } as const;
              }
            }

            return {
              success: true,
              synced: false,
              credited: false,
              status,
              reason: "contribution_not_found",
            } as const;
          }

          const validAmount = paidAmount === contribution.amount;
          const validCurrency = payment.currency_id === "BRL";

          if (!validAmount || !validCurrency) {
            return {
              success: true,
              synced: false,
              credited: false,
              status: contribution.status,
              reason: "amount_or_currency_mismatch",
            } as const;
          }

          try {
            await db
              .update(contributions)
              .set({
                status,
                paymentId: String(payment.id),
                paymentStatusDetail: payment.status_detail || payment.status || null,
                paymentMethod,
                paidAt,
                updatedAt: new Date(),
              })
              .where(eq(contributions.id, contribution.id));
          } catch (error) {
            if (!isMissingColumnError(error)) throw error;
            const updated = await tryUpdatePaymentLegacy(db as { execute: (query: unknown) => Promise<unknown> }, {
              contributionId: contribution.id,
              status,
              paymentId: String(payment.id),
              paidAt,
            });
            if (!updated) throw error;
          }

          return {
            success: true,
            synced: true,
            credited: status === "approved" || status === "completed",
            status,
            campaignId: contribution.campaignId,
            amount: contribution.amount,
            externalReference: contribution.externalReference,
          } as const;
        } catch (error) {
          const message = getReadableErrorMessage(error);
          throw new TRPCError({ code: "BAD_GATEWAY", message });
        }
      }

      const fallbackConditions = [
        resolvedExternalReference ? eq(contributions.externalReference, resolvedExternalReference) : undefined,
        input.preferenceId ? eq(contributions.preferenceId, input.preferenceId) : undefined,
      ].filter(Boolean);

      if (fallbackConditions.length === 0) {
        return {
          success: true,
          synced: false,
          credited: false,
          status: "pending",
          reason: "missing_identifiers",
        } as const;
      }

      const [existingContribution] = await db
        .select({
          campaignId: contributions.campaignId,
          amount: contributions.amount,
          status: contributions.status,
          externalReference: contributions.externalReference,
        })
        .from(contributions)
        .where(and(eq(contributions.type, "financial"), or(...fallbackConditions)))
        .limit(1);

      if (!existingContribution) {
        return {
          success: true,
          synced: false,
          credited: false,
          status: "pending",
          reason: "contribution_not_found",
        } as const;
      }

      return {
        success: true,
        synced: false,
        credited: existingContribution.status === "approved" || existingContribution.status === "completed",
        status: existingContribution.status,
        campaignId: existingContribution.campaignId,
        amount: existingContribution.amount,
        externalReference: existingContribution.externalReference,
      } as const;
    }),
});
