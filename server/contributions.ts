import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { campaignNeeds, campaigns, contributions, users } from "../drizzle/schema";
import { protectedProcedure, publicProcedure, router, sectionProcedure } from "./_core/trpc";
import {
  createFallbackCashContribution,
  listFallbackCashContributions,
  listFallbackPendingCashValidations,
  listFallbackRecentCashValidations,
  reviewFallbackCashContribution,
} from "./cashValidationFallback";
import { getDb } from "./db";
import {
  createFallbackMaterialContribution,
  getFallbackMaterialTrackedQuantityForNeed,
  hasFallbackMaterialDonationForNeed,
  listFallbackMaterialContributions,
  listFallbackPendingMaterialValidations,
  listFallbackRecentMaterialValidations,
  reviewFallbackMaterialContribution,
} from "./materialValidationFallback";
import { whatsappService } from "./whatsapp.service";

const CASH_AUDIT_DETAILS = ["cash_validated_in_person", "cash_validation_rejected"] as const;
const CASH_PENDING_DETAILS = ["awaiting_cash_confirmation", "awaiting_validation", "awaiting_payment"] as const;
const MATERIAL_AUDIT_DETAILS = ["material_validated", "material_rejected"] as const;
const MATERIAL_PENDING_DETAILS = ["awaiting_triage"] as const;
const CANONICAL_LOCAL_CAMPAIGN_ID = 100001;
const CANONICAL_LOCAL_NEEDS: Record<number, { name: string; targetQuantityExact: number; unitValueCents: number }> = {
  1: { name: "Cimento", targetQuantityExact: 200, unitValueCents: 4_500 },
  2: { name: "Tijolo", targetQuantityExact: 12_000, unitValueCents: 120 },
};

function normalizeWhatsapp(value?: string | null) {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : undefined;
}

function normalizeCpf(value?: string | null) {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : undefined;
}

function donorLookupKey(input: {
  donorCpf?: string | null;
  donorWhatsapp?: string | null;
  donorEmail?: string | null;
  donorName?: string | null;
}) {
  const cpf = normalizeCpf(input.donorCpf);
  if (cpf) return `cpf:${cpf}`;

  const whatsapp = normalizeWhatsapp(input.donorWhatsapp);
  if (whatsapp) return `whatsapp:${whatsapp}`;

  const email = input.donorEmail?.trim().toLowerCase();
  if (email) return `email:${email}`;

  const name = input.donorName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  return null;
}

function isMissingColumnError(error: unknown): boolean {
  const stack = [error];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") {
      continue;
    }

    const candidate = current as {
      message?: unknown;
      code?: unknown;
      sqlMessage?: unknown;
      cause?: unknown;
    };

    if (
      candidate.code === "ER_BAD_FIELD_ERROR"
      || (typeof candidate.message === "string" && candidate.message.includes("Unknown column"))
      || (typeof candidate.sqlMessage === "string" && candidate.sqlMessage.includes("Unknown column"))
    ) {
      return true;
    }

    if (candidate.cause) {
      stack.push(candidate.cause);
    }
  }

  return false;
}

const donorInfoSchema = z.object({
  donorName: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().max(255).optional().default(""),
  ),
  donorCpf: z.preprocess(
    (value) => (typeof value === "string" ? normalizeCpf(value) ?? "" : ""),
    z.string().max(14).optional().default(""),
  ),
  donorWhatsapp: z.preprocess(
    (value) => (typeof value === "string" ? normalizeWhatsapp(value) ?? "" : ""),
    z.string().max(20).optional().default(""),
  ),
  donorEmail: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const normalized = value.trim();
      return normalized.length === 0 ? undefined : normalized;
    },
    z.string().email().optional(),
  ),
  donorCity: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().max(255).optional().default(""),
  ),
  donorChurch: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().max(255).optional().default(""),
  ),
  donorBirthDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  donorGender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  allowPublicDisplay: z.preprocess(
    (value) => (value === undefined ? false : value),
    z.boolean().optional().default(false),
  ),
});

const offerSchema = z.object({
  campaignId: z.number().int().positive(),
  description: z.string().trim().min(3).max(3000),
  ...donorInfoSchema.shape,
  campaignNeedId: z.number().int().positive().optional(),
  quantityExact: z.number().int().positive().optional(),
  quantity: z.string().trim().max(255).optional(),
  deliveryMethod: z.enum(["pickup", "deliver", "mail", "other"]).optional(),
  numberOfInstallments: z.number().int().min(2).max(24).optional(),
  materialDeliveryFrequency: z.enum(["unique", "weekly", "biweekly", "monthly"]).optional(),
});

// Pendentes tambem reservam saldo do item para evitar ultrapassar meta ate aprovacao/rejeicao.
const TRACKED_MATERIAL_STATUSES = ["pending", "approved", "completed"] as const;

async function assertActiveCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) {
    if (campaignId === CANONICAL_LOCAL_CAMPAIGN_ID) {
      return null;
    }

    const fallbackCampaign = whatsappService
      .getFallbackCampaigns()
      .find((campaign) => campaign.id === campaignId && campaign.status === "active");

    if (!fallbackCampaign) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Campanha ativa não encontrada" });
    }

    return null;
  }

  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "active")))
    .limit(1);

  if (!campaign) {
    if (campaignId >= 100000) {
      const fallbackCampaign = whatsappService
        .getFallbackCampaigns()
        .find((item) => item.id === campaignId && item.status === "active");

      if (fallbackCampaign) {
        return null;
      }
    }

    throw new TRPCError({ code: "NOT_FOUND", message: "Campanha ativa não encontrada" });
  }

  return db;
}

async function createOffer(input: z.infer<typeof offerSchema>, ctx: {
  user: { id: number; email: string | null; name: string | null } | null;
}, type: "material" | "volunteer") {
  const db = await assertActiveCampaign(input.campaignId);
  let description = input.description;
  let estimatedAmount: number | undefined;
  const donorEmail = input.donorEmail?.trim().toLowerCase() || undefined;
  const donorCpf = normalizeCpf((input as { donorCpf?: string }).donorCpf);
  const donorWhatsapp = normalizeWhatsapp(input.donorWhatsapp);

  if (!db) {
    if (type === "material") {
      if (input.campaignNeedId && input.quantityExact) {
        if (hasFallbackMaterialDonationForNeed({
          campaignId: input.campaignId,
          campaignNeedId: input.campaignNeedId,
          donorEmail,
          donorWhatsapp,
        })) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este doador já possui uma oferta registrada para este item da campanha.",
          });
        }

        const canonicalNeed = input.campaignId === CANONICAL_LOCAL_CAMPAIGN_ID
          ? CANONICAL_LOCAL_NEEDS[input.campaignNeedId]
          : undefined;

        const fallbackNeed = whatsappService
          .getFallbackCampaigns()
          .find((campaign) => campaign.id === input.campaignId)
          ?.needs
          ?.find((need) => need.id === input.campaignNeedId);

        const targetQuantityExact = canonicalNeed?.targetQuantityExact
          ?? fallbackNeed?.targetQuantityExact
          ?? 0;

        const unitValueCents = canonicalNeed?.unitValueCents
          ?? fallbackNeed?.unitValueCents
          ?? 0;

        const needName = canonicalNeed?.name
          ?? fallbackNeed?.name;

        if (targetQuantityExact > 0) {
          const alreadyOffered = getFallbackMaterialTrackedQuantityForNeed({
            campaignId: input.campaignId,
            campaignNeedId: input.campaignNeedId,
          });
          const remaining = Math.max(0, targetQuantityExact - alreadyOffered);

          if (input.quantityExact > remaining) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Quantidade ofertada excede o saldo restante deste item (${remaining}).`,
            });
          }
        }

        const segments: string[] = [input.description];
        if (needName) segments.push(`Necessidade: ${needName}`);
        segments.push(`Quantidade: ${String(input.quantityExact)}`);
        if (unitValueCents > 0) {
          estimatedAmount = input.quantityExact * unitValueCents;
          segments.push(`Valor unitário: R$ ${(unitValueCents / 100).toFixed(2).replace(".", ",")}`);
          segments.push(`Valor estimado: R$ ${(estimatedAmount / 100).toFixed(2).replace(".", ",")}`);
        }
        description = segments.join(" | ");
      }

      createFallbackMaterialContribution({
        campaignId: input.campaignId,
        campaignNeedId: input.campaignNeedId,
        donorName: input.donorName,
        donorCpf,
        donorEmail,
        donorWhatsapp,
        donorCity: input.donorCity,
        donorChurch: input.donorChurch,
        allowPublicDisplay: Boolean(input.allowPublicDisplay),
        description,
        quantity: input.quantity,
        quantityExact: input.quantityExact,
        estimatedAmount,
        deliveryMethod: input.deliveryMethod,
        materialDeliveryFrequency: input.materialDeliveryFrequency,
      });
    }

    return {
      success: true,
      message: type === "material"
        ? "Oferta de material recebida no modo local. A equipe entrará em contato após a triagem."
        : "Oferta de voluntariado recebida no modo local. A equipe entrará em contato após a triagem.",
    };
  }

  if (type === "material") {
    const segments: string[] = [input.description];

    if (input.campaignNeedId) {
      if (!input.quantityExact) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a quantidade exata ofertada." });
      }

      let need:
        | {
          name: string;
          quantity: string | null;
          targetQuantityExact: number | null;
          unitValueCents: number | null;
        }
        | undefined;

      try {
        const [needRow] = await db
          .select({
            name: campaignNeeds.name,
            quantity: campaignNeeds.quantity,
            targetQuantityExact: campaignNeeds.targetQuantityExact,
            unitValueCents: campaignNeeds.unitValueCents,
          })
          .from(campaignNeeds)
          .where(and(eq(campaignNeeds.id, input.campaignNeedId), eq(campaignNeeds.campaignId, input.campaignId)))
          .limit(1);
        need = needRow;
      } catch (error) {
        if (!isMissingColumnError(error)) throw error;

        const [legacyNeed] = await db
          .select({
            name: campaignNeeds.name,
            quantity: campaignNeeds.quantity,
          })
          .from(campaignNeeds)
          .where(and(eq(campaignNeeds.id, input.campaignNeedId), eq(campaignNeeds.campaignId, input.campaignId)))
          .limit(1);

        need = legacyNeed
          ? {
            ...legacyNeed,
            targetQuantityExact: null,
            unitValueCents: null,
          }
          : undefined;
      }

      if (!need) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Necessidade da campanha não encontrada" });
      }

      if (need.targetQuantityExact && need.targetQuantityExact > 0) {
        try {
          const offeredRows = await db
            .select({ quantityExact: contributions.quantityExact })
            .from(contributions)
            .where(
              and(
                eq(contributions.campaignId, input.campaignId),
                eq(contributions.type, "material"),
                eq(contributions.campaignNeedId, input.campaignNeedId),
                inArray(contributions.status, TRACKED_MATERIAL_STATUSES),
              ),
            );

          const alreadyOffered = offeredRows.reduce((sum, row) => sum + Math.max(0, row.quantityExact ?? 0), 0);
          const remaining = Math.max(0, need.targetQuantityExact - alreadyOffered);

          if (input.quantityExact > remaining) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Quantidade ofertada excede o saldo restante deste item (${remaining}).`,
            });
          }
        } catch (error) {
          if (!isMissingColumnError(error)) throw error;
        }
      }

      if (need.name) segments.push(`Necessidade: ${need.name}`);
      const resolvedQuantity = String(input.quantityExact);
      if (resolvedQuantity) segments.push(`Quantidade: ${resolvedQuantity}`);
      if (need.unitValueCents && need.unitValueCents > 0) {
        estimatedAmount = input.quantityExact * need.unitValueCents;
        segments.push(`Valor unitário: R$ ${(need.unitValueCents / 100).toFixed(2).replace(".", ",")}`);
        segments.push(`Valor estimado: R$ ${(estimatedAmount / 100).toFixed(2).replace(".", ",")}`);
      }
    } else if (input.quantity?.trim()) {
      segments.push(`Quantidade: ${input.quantity.trim()}`);
    }

    description = segments.join(" | ");
  }

  try {
    await db.insert(contributions).values({
      campaignId: input.campaignId,
      userId: ctx.user?.id,
      type,
      description,
      donorName: input.donorName,
      donorCpf,
      donorEmail,
      donorWhatsapp,
      donorCity: input.donorCity,
      donorChurch: input.donorChurch,
      donorBirthDate: (input as { donorBirthDate?: string }).donorBirthDate
        ? new Date((input as { donorBirthDate?: string }).donorBirthDate!)
        : undefined,
      donorGender: (input as { donorGender?: string }).donorGender as "male" | "female" | "other" | "prefer_not_to_say" | undefined,
      allowPublicDisplay: Boolean(input.allowPublicDisplay),
      deliveryMethod: type === "material" ? input.deliveryMethod : undefined,
      campaignNeedId: type === "material" ? input.campaignNeedId : undefined,
      quantityExact: type === "material" ? input.quantityExact : undefined,
      estimatedAmount: type === "material" ? estimatedAmount : undefined,
      numberOfInstallments: input.numberOfInstallments,
      materialDeliveryFrequency: type === "material" ? input.materialDeliveryFrequency : undefined,
      status: "pending",
      paymentStatusDetail: "awaiting_triage",
    });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;

    await db.insert(contributions).values({
      campaignId: input.campaignId,
      userId: ctx.user?.id,
      type,
      description,
      donorName: input.donorName,
      donorCpf,
      donorEmail,
      donorWhatsapp,
      donorCity: input.donorCity,
      donorChurch: input.donorChurch,
      allowPublicDisplay: Boolean(input.allowPublicDisplay),
      deliveryMethod: type === "material" ? input.deliveryMethod : undefined,
      numberOfInstallments: input.numberOfInstallments,
      materialDeliveryFrequency: type === "material" ? input.materialDeliveryFrequency : undefined,
      status: "pending",
      paymentStatusDetail: "awaiting_triage",
    });
  }

  return {
    success: true,
    message: type === "material"
      ? "Oferta de material recebida. A equipe entrará em contato após a triagem."
      : "Oferta de voluntariado recebida. A equipe entrará em contato após a triagem.",
  };
}

export const contributionsRouter = router({
  createMaterialContribution: publicProcedure
    .input(offerSchema)
    .mutation(({ input, ctx }) => createOffer(input, ctx, "material")),

  createVolunteerContribution: publicProcedure
    .input(offerSchema)
    .mutation(({ input, ctx }) => createOffer(input, ctx, "volunteer")),

  createFinancialContribution: publicProcedure
    .input(z.object({
      campaignId: z.number().int().positive(),
      amount: z.number().int().min(100),
      ...donorInfoSchema.shape,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await assertActiveCampaign(input.campaignId);
      if (!db) {
        return {
          success: true,
          message: "Doação financeira registrada. Você será redirecionado para o pagamento.",
          fallback: true,
        };
      }

      try {
        await db.insert(contributions).values({
          campaignId: input.campaignId,
          userId: ctx.user?.id,
          type: "financial",
          amount: input.amount,
          donorName: input.donorName,
          donorCpf: input.donorCpf,
          donorEmail: input.donorEmail,
          donorWhatsapp: input.donorWhatsapp,
          donorCity: input.donorCity,
          donorChurch: input.donorChurch,
          allowPublicDisplay: Boolean(input.allowPublicDisplay),
          status: "pending",
          paymentStatusDetail: "awaiting_payment",
        });
      } catch (error) {
        if (!isMissingColumnError(error)) throw error;

        await db.insert(contributions).values({
          campaignId: input.campaignId,
          userId: ctx.user?.id,
          type: "financial",
          amount: input.amount,
          donorName: input.donorName,
          donorEmail: input.donorEmail,
          donorWhatsapp: input.donorWhatsapp,
          donorCity: input.donorCity,
          donorChurch: input.donorChurch,
          allowPublicDisplay: Boolean(input.allowPublicDisplay),
          status: "pending",
          paymentStatusDetail: "awaiting_payment",
        });
      }

      return {
        success: true,
        message: "Doação financeira registrada. Você será redirecionado para o pagamento.",
      };
    }),

  deleteTestContributions: sectionProcedure("community")
    .input(z.object({
      contributionIds: z.array(z.number().int().positive()).min(1).max(100),
      confirmation: z.literal("EXCLUIR DADOS DE TESTE"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "O banco de dados não está disponível para excluir contribuições.",
        });
      }

      const contributionIds = Array.from(new Set(input.contributionIds));
      const existingRows = await db
        .select({ id: contributions.id })
        .from(contributions)
        .where(inArray(contributions.id, contributionIds));
      const existingIds = new Set(existingRows.map((row) => row.id));
      const missingIds = contributionIds.filter((id) => !existingIds.has(id));

      if (missingIds.length > 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Contribuições não encontradas: ${missingIds.join(", ")}`,
        });
      }

      await db.delete(contributions).where(inArray(contributions.id, contributionIds));

      return {
        success: true as const,
        deletedCount: contributionIds.length,
        contributionIds,
      };
    }),

  getDonorProfileByWhatsapp: publicProcedure
    .input(z.object({ donorWhatsapp: z.string().trim().min(8).max(20).optional(), donorCpf: z.string().trim().min(8).max(14).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return null;
      }

      const normalizedWhatsapp = input.donorWhatsapp?.replace(/\D/g, "") ?? "";
      const normalizedCpf = normalizeCpf(input.donorCpf) ?? "";
      if (!normalizedWhatsapp && !normalizedCpf) {
        return null;
      }

      let rows: Array<{
        donorName: string | null;
        donorCpf?: string | null;
        donorWhatsapp: string | null;
        donorEmail: string | null;
        donorCity: string | null;
        donorChurch: string | null;
        allowPublicDisplay: boolean | null;
      }> = [];

      try {
        rows = await db
          .select({
            donorName: contributions.donorName,
            donorCpf: contributions.donorCpf,
            donorWhatsapp: contributions.donorWhatsapp,
            donorEmail: contributions.donorEmail,
            donorCity: contributions.donorCity,
            donorChurch: contributions.donorChurch,
            allowPublicDisplay: contributions.allowPublicDisplay,
          })
          .from(contributions)
          .limit(50);
      } catch (error) {
        if (!isMissingColumnError(error)) throw error;
        rows = await db
          .select({
            donorName: contributions.donorName,
            donorWhatsapp: contributions.donorWhatsapp,
            donorEmail: contributions.donorEmail,
            donorCity: contributions.donorCity,
            donorChurch: contributions.donorChurch,
            allowPublicDisplay: contributions.allowPublicDisplay,
          })
          .from(contributions)
          .limit(50);
      }

      const match = rows.find((row) => {
        const storedCpf = normalizeCpf(row.donorCpf) ?? "";
        const storedWhatsapp = (row.donorWhatsapp || "").replace(/\D/g, "");
        return (normalizedCpf && storedCpf === normalizedCpf) || (normalizedWhatsapp && storedWhatsapp === normalizedWhatsapp);
      });

      if (!match) {
        return null;
      }

      return {
        donorName: match.donorName,
        donorCpf: match.donorCpf,
        donorWhatsapp: match.donorWhatsapp,
        donorEmail: match.donorEmail,
        donorCity: match.donorCity,
        donorChurch: match.donorChurch,
        allowPublicDisplay: match.allowPublicDisplay ?? false,
      };
    }),

  getDonorProfileLookup: publicProcedure
    .input(z.object({
      donorCpf: z.string().trim().min(8).max(14).optional(),
      donorWhatsapp: z.string().trim().min(8).max(20).optional(),
      donorName: z.string().trim().min(2).max(255).optional(),
      donorEmail: z.string().trim().email().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const normalizedCpf = normalizeCpf(input.donorCpf) ?? "";
      const normalizedWhatsapp = input.donorWhatsapp?.replace(/\D/g, "") ?? "";
      const normalizedName = input.donorName?.trim().toLowerCase() ?? "";
      const normalizedEmail = input.donorEmail?.trim().toLowerCase() ?? "";

      if (!normalizedCpf && !normalizedWhatsapp && normalizedName.length < 2 && !normalizedEmail) {
        return null;
      }

      if (!db) {
        const fallbackRows = [
          ...listFallbackCashContributions(),
          ...listFallbackMaterialContributions(),
        ];

        const byCpf = normalizedCpf
          ? fallbackRows.find((row) => normalizeCpf(row.donorCpf) === normalizedCpf)
          : undefined;
        const byEmail = normalizedEmail
          ? fallbackRows.find((row) => (row.donorEmail || "").trim().toLowerCase() === normalizedEmail)
          : undefined;
        const byWhatsapp = normalizedWhatsapp
          ? fallbackRows.find((row) => (row.donorWhatsapp || "").replace(/\D/g, "") === normalizedWhatsapp)
          : undefined;
        const byName = !byCpf && !byWhatsapp && normalizedName
          ? (
            fallbackRows.find((row) => (row.donorName || "").trim().toLowerCase() === normalizedName)
            || fallbackRows.find((row) => (row.donorName || "").trim().toLowerCase().includes(normalizedName))
          )
          : undefined;

        const match = byCpf ?? byEmail ?? byWhatsapp ?? byName;
        if (!match) {
          return null;
        }

        return {
          donorName: match.donorName,
          donorCpf: match.donorCpf,
          donorWhatsapp: match.donorWhatsapp,
          donorEmail: match.donorEmail,
          donorCity: match.donorCity,
          donorChurch: match.donorChurch,
          allowPublicDisplay: match.allowPublicDisplay ?? false,
        };
      }

      let rows: Array<{
        donorName: string | null;
        donorCpf?: string | null;
        donorWhatsapp: string | null;
        donorEmail: string | null;
        donorCity: string | null;
        donorChurch: string | null;
        allowPublicDisplay: boolean | null;
        createdAt: Date;
      }> = [];

      try {
        rows = await db
          .select({
            donorName: contributions.donorName,
            donorCpf: contributions.donorCpf,
            donorWhatsapp: contributions.donorWhatsapp,
            donorEmail: contributions.donorEmail,
            donorCity: contributions.donorCity,
            donorChurch: contributions.donorChurch,
            allowPublicDisplay: contributions.allowPublicDisplay,
            createdAt: contributions.createdAt,
          })
          .from(contributions)
          .orderBy(desc(contributions.createdAt))
          .limit(300);
      } catch (error) {
        if (!isMissingColumnError(error)) throw error;
        rows = await db
          .select({
            donorName: contributions.donorName,
            donorWhatsapp: contributions.donorWhatsapp,
            donorEmail: contributions.donorEmail,
            donorCity: contributions.donorCity,
            donorChurch: contributions.donorChurch,
            allowPublicDisplay: contributions.allowPublicDisplay,
            createdAt: contributions.createdAt,
          })
          .from(contributions)
          .orderBy(desc(contributions.createdAt))
          .limit(300);
      }

      const byCpf = normalizedCpf
        ? rows.find((row) => normalizeCpf(row.donorCpf) === normalizedCpf)
        : undefined;
      const byEmail = normalizedEmail
        ? rows.find((row) => (row.donorEmail || "").trim().toLowerCase() === normalizedEmail)
        : undefined;

      const byWhatsapp = normalizedWhatsapp
        ? rows.find((row) => (row.donorWhatsapp || "").replace(/\D/g, "") === normalizedWhatsapp)
        : undefined;

      const byName = !byCpf && !byWhatsapp && normalizedName
        ? (
          rows.find((row) => (row.donorName || "").trim().toLowerCase() === normalizedName)
          || rows.find((row) => (row.donorName || "").trim().toLowerCase().includes(normalizedName))
        )
        : undefined;

      const match = byCpf ?? byEmail ?? byWhatsapp ?? byName;
      if (!match) {
        return null;
      }

      return {
        donorName: match.donorName,
        donorCpf: match.donorCpf,
        donorWhatsapp: match.donorWhatsapp,
        donorEmail: match.donorEmail,
        donorCity: match.donorCity,
        donorChurch: match.donorChurch,
        allowPublicDisplay: match.allowPublicDisplay ?? false,
      };
    }),

  getRegisteredDonors: sectionProcedure("community").query(async () => {
    const db = await getDb();
    if (!db) {
      const rows = [
        ...listFallbackCashContributions()
          .filter((row) => row.status === "approved")
          .map((row) => ({
            donorName: row.donorName,
            donorCpf: row.donorCpf,
            donorWhatsapp: row.donorWhatsapp,
            donorEmail: row.donorEmail,
            donorCity: row.donorCity,
            donorChurch: row.donorChurch,
            allowPublicDisplay: row.allowPublicDisplay,
            amount: row.amount,
            createdAt: row.createdAt,
          })),
        ...listFallbackMaterialContributions()
          .filter((row) => row.status === "approved")
          .map((row) => ({
            donorName: row.donorName,
            donorCpf: row.donorCpf,
            donorWhatsapp: row.donorWhatsapp,
            donorEmail: row.donorEmail,
            donorCity: row.donorCity,
            donorChurch: row.donorChurch,
            allowPublicDisplay: row.allowPublicDisplay,
            amount: row.estimatedAmount,
            createdAt: row.createdAt,
          })),
      ];

      const aggregated = new Map<string, {
        key: string;
        donorCpf: string | null;
        donorName: string;
        donorWhatsapp: string;
        donorEmail: string;
        donorCity: string;
        donorChurch: string;
        donationsCount: number;
        totalAmountCents: number;
        lastDonationAt: Date;
        allowPublicDisplay: boolean;
      }>();

      for (const row of rows) {
        const key = donorLookupKey(row) ?? `row:${row.donorName || row.donorEmail || row.donorWhatsapp || row.createdAt.toISOString()}`;
        const current = aggregated.get(key);
        if (current) {
          current.donationsCount += 1;
          current.totalAmountCents += Math.max(0, row.amount ?? 0);
          if (row.createdAt > current.lastDonationAt) {
            current.lastDonationAt = row.createdAt;
            current.donorName = row.donorName || current.donorName;
            current.donorCpf = row.donorCpf || current.donorCpf;
            current.donorWhatsapp = row.donorWhatsapp || current.donorWhatsapp;
            current.donorEmail = row.donorEmail || current.donorEmail;
            current.donorCity = row.donorCity || current.donorCity;
            current.donorChurch = row.donorChurch || current.donorChurch;
            current.allowPublicDisplay = Boolean(row.allowPublicDisplay ?? current.allowPublicDisplay);
          }
          continue;
        }

        aggregated.set(key, {
          key,
          donorCpf: row.donorCpf ?? null,
          donorName: row.donorName || "Não informado",
          donorWhatsapp: row.donorWhatsapp || "",
          donorEmail: row.donorEmail || "",
          donorCity: row.donorCity || "",
          donorChurch: row.donorChurch || "",
          donationsCount: 1,
          totalAmountCents: Math.max(0, row.amount ?? 0),
          lastDonationAt: row.createdAt,
          allowPublicDisplay: Boolean(row.allowPublicDisplay),
        });
      }

      return Array.from(aggregated.values())
        .sort((a, b) => b.lastDonationAt.getTime() - a.lastDonationAt.getTime())
        .map((donor) => ({
          ...donor,
          lastDonationAt: donor.lastDonationAt.toISOString(),
        }));
    }

    let rows: Array<{
      donorName: string | null;
      donorCpf?: string | null;
      donorWhatsapp: string | null;
      donorEmail: string | null;
      donorCity: string | null;
      donorChurch: string | null;
      allowPublicDisplay: boolean | null;
      amount: number | null;
      createdAt: Date;
    }> = [];

    try {
      rows = await db
        .select({
          donorName: contributions.donorName,
          donorCpf: contributions.donorCpf,
          donorWhatsapp: contributions.donorWhatsapp,
          donorEmail: contributions.donorEmail,
          donorCity: contributions.donorCity,
          donorChurch: contributions.donorChurch,
          allowPublicDisplay: contributions.allowPublicDisplay,
          amount: contributions.amount,
          createdAt: contributions.createdAt,
        })
        .from(contributions)
        .orderBy(desc(contributions.createdAt))
        .limit(1000);
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      rows = await db
        .select({
          donorName: contributions.donorName,
          donorWhatsapp: contributions.donorWhatsapp,
          donorEmail: contributions.donorEmail,
          donorCity: contributions.donorCity,
          donorChurch: contributions.donorChurch,
          allowPublicDisplay: contributions.allowPublicDisplay,
          amount: contributions.amount,
          createdAt: contributions.createdAt,
        })
        .from(contributions)
        .orderBy(desc(contributions.createdAt))
        .limit(1000);
    }

    const aggregated = new Map<string, {
      key: string;
      donorCpf: string | null;
      donorName: string;
      donorWhatsapp: string;
      donorEmail: string;
      donorCity: string;
      donorChurch: string;
      donationsCount: number;
      totalAmountCents: number;
      lastDonationAt: Date;
      allowPublicDisplay: boolean;
    }>();

    for (const row of rows) {
      const key = donorLookupKey(row) ?? `row:${row.donorName || row.donorEmail || row.donorWhatsapp || row.createdAt.toISOString()}`;
      const current = aggregated.get(key);
      if (current) {
        current.donationsCount += 1;
        current.totalAmountCents += Math.max(0, row.amount ?? 0);
        if (row.createdAt > current.lastDonationAt) {
          current.lastDonationAt = row.createdAt;
          current.donorName = row.donorName || current.donorName;
          current.donorCpf = row.donorCpf || current.donorCpf;
          current.donorWhatsapp = row.donorWhatsapp || current.donorWhatsapp;
          current.donorEmail = row.donorEmail || current.donorEmail;
          current.donorCity = row.donorCity || current.donorCity;
          current.donorChurch = row.donorChurch || current.donorChurch;
          current.allowPublicDisplay = Boolean(row.allowPublicDisplay ?? current.allowPublicDisplay);
        }
        continue;
      }

      aggregated.set(key, {
        key,
        donorCpf: row.donorCpf ?? null,
        donorName: row.donorName || "Não informado",
        donorWhatsapp: row.donorWhatsapp || "",
        donorEmail: row.donorEmail || "",
        donorCity: row.donorCity || "",
        donorChurch: row.donorChurch || "",
        donationsCount: 1,
        totalAmountCents: Math.max(0, row.amount ?? 0),
        lastDonationAt: row.createdAt,
        allowPublicDisplay: Boolean(row.allowPublicDisplay),
      });
    }

    return Array.from(aggregated.values())
      .sort((a, b) => b.lastDonationAt.getTime() - a.lastDonationAt.getTime())
      .map((donor) => ({
        ...donor,
        lastDonationAt: donor.lastDonationAt.toISOString(),
      }));
  }),

  getUserContributions: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
    }

    return db
      .select()
      .from(contributions)
      .where(eq(contributions.userId, ctx.user.id));
  }),

  getPublicDonors: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return [];
    }

    return db
      .select({
        id: contributions.id,
        donorName: contributions.donorName,
        donorCity: contributions.donorCity,
        type: contributions.type,
        amount: contributions.amount,
        description: contributions.description,
        campaignTitle: campaigns.title,
        createdAt: contributions.createdAt,
      })
      .from(contributions)
      .leftJoin(campaigns, eq(campaigns.id, contributions.campaignId))
      .where(
        and(
          eq(contributions.allowPublicDisplay, true),
          inArray(contributions.status, ["approved", "completed"]),
        ),
      )
      .orderBy(desc(contributions.createdAt))
      .limit(100);
  }),

  // Lista completa (qualquer status) pra o admin conseguir auditar e remover
  // contribuições de teste/erradas — getPublicDonors só mostra as aprovadas.
  getRecentContributions: sectionProcedure("community").query(async () => {
    const db = await getDb();
    if (!db) return [];

    return db
      .select({
        id: contributions.id,
        donorName: contributions.donorName,
        donorEmail: contributions.donorEmail,
        type: contributions.type,
        status: contributions.status,
        amount: contributions.amount,
        description: contributions.description,
        campaignTitle: campaigns.title,
        createdAt: contributions.createdAt,
      })
      .from(contributions)
      .leftJoin(campaigns, eq(campaigns.id, contributions.campaignId))
      .orderBy(desc(contributions.createdAt))
      .limit(100);
  }),

  deleteContribution: sectionProcedure("community")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco indisponível" });

      await db.delete(contributions).where(eq(contributions.id, input.id));
      return { success: true };
    }),

  getPendingCashValidations: sectionProcedure("validations")
    .input(z.object({ campaignId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      const fallbackPending = listFallbackPendingCashValidations(input?.campaignId);
      const db = await getDb();
      if (!db) {
        return fallbackPending;
      }

      const conditions = [
        eq(contributions.type, "financial"),
        or(
          and(
            or(eq(contributions.status, "pending"), isNull(contributions.status)),
            eq(contributions.paymentMethod, "cash"),
            or(
              inArray(contributions.paymentStatusDetail, CASH_PENDING_DETAILS),
              isNull(contributions.paymentStatusDetail),
            ),
          ),
          and(
            or(eq(contributions.status, "pending"), isNull(contributions.status)),
            isNull(contributions.paymentMethod),
            or(
              inArray(contributions.paymentStatusDetail, CASH_PENDING_DETAILS),
              isNull(contributions.paymentStatusDetail),
            ),
          ),
        ),
      ];

      if (input?.campaignId) {
        conditions.push(eq(contributions.campaignId, input.campaignId));
      }

      try {
        const rows = await db
          .select({
            id: contributions.id,
            campaignId: contributions.campaignId,
            donorName: contributions.donorName,
            donorWhatsapp: contributions.donorWhatsapp,
            donorCity: contributions.donorCity,
            amount: contributions.amount,
            createdAt: contributions.createdAt,
            paymentStatusDetail: contributions.paymentStatusDetail,
          })
          .from(contributions)
          .where(and(...conditions))
          .orderBy(desc(contributions.createdAt));

        if (!fallbackPending.length) {
          return rows;
        }

        const existingIds = new Set(rows.map((row) => row.id));
        const merged = [...rows];
        for (const fallbackRow of fallbackPending) {
          if (!existingIds.has(fallbackRow.id)) {
            merged.push(fallbackRow);
          }
        }

        return merged;
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }

        const legacyConditions = [
          eq(contributions.type, "financial"),
          or(eq(contributions.status, "pending"), isNull(contributions.status)),
        ];

        if (input?.campaignId) {
          legacyConditions.push(eq(contributions.campaignId, input.campaignId));
        }

        const legacyRows = await db
          .select({
            id: contributions.id,
            campaignId: contributions.campaignId,
            donorName: contributions.donorName,
            amount: contributions.amount,
            createdAt: contributions.createdAt,
          })
          .from(contributions)
          .where(and(...legacyConditions))
          .orderBy(desc(contributions.createdAt));

        const mappedLegacyRows: Array<{
          id: number;
          campaignId: number;
          donorName: string | null;
          donorWhatsapp: string;
          donorCity: string;
          amount: number | null;
          createdAt: Date;
          paymentStatusDetail: string | null;
        }> = legacyRows.map((row) => ({
          ...row,
          donorWhatsapp: "",
          donorCity: "",
          paymentStatusDetail: null,
        }));

        if (!fallbackPending.length) {
          return mappedLegacyRows;
        }

        const existingIds = new Set(mappedLegacyRows.map((row) => row.id));
        const merged = [...mappedLegacyRows];
        for (const fallbackRow of fallbackPending) {
          if (!existingIds.has(fallbackRow.id)) {
            merged.push({
              id: fallbackRow.id,
              campaignId: fallbackRow.campaignId,
              donorName: fallbackRow.donorName,
              donorWhatsapp: fallbackRow.donorWhatsapp ?? "",
              donorCity: fallbackRow.donorCity ?? "",
              amount: fallbackRow.amount,
              createdAt: fallbackRow.createdAt,
              paymentStatusDetail: fallbackRow.paymentStatusDetail ?? null,
            });
          }
        }

        return merged;
      }
    }),

  getPendingMaterialValidations: sectionProcedure("validations")
    .input(z.object({ campaignId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      const fallbackPending = listFallbackPendingMaterialValidations(input?.campaignId);
      const db = await getDb();
      if (!db) {
        return fallbackPending.map((row) => ({ ...row, campaignTitle: null, needName: null }));
      }

      const conditions = [
        eq(contributions.type, "material"),
        or(eq(contributions.status, "pending"), isNull(contributions.status)),
        or(
          inArray(contributions.paymentStatusDetail, MATERIAL_PENDING_DETAILS),
          isNull(contributions.paymentStatusDetail),
        ),
      ];

      if (input?.campaignId) {
        conditions.push(eq(contributions.campaignId, input.campaignId));
      }

      try {
        const rows = await db
          .select({
            id: contributions.id,
            campaignId: contributions.campaignId,
            campaignTitle: campaigns.title,
            campaignNeedId: contributions.campaignNeedId,
            needName: campaignNeeds.name,
            donorName: contributions.donorName,
            donorWhatsapp: contributions.donorWhatsapp,
            donorCity: contributions.donorCity,
            description: contributions.description,
            quantity: contributions.description,
            quantityExact: contributions.quantityExact,
            estimatedAmount: contributions.estimatedAmount,
            createdAt: contributions.createdAt,
            paymentStatusDetail: contributions.paymentStatusDetail,
          })
          .from(contributions)
          .leftJoin(campaigns, eq(campaigns.id, contributions.campaignId))
          .leftJoin(campaignNeeds, eq(campaignNeeds.id, contributions.campaignNeedId))
          .where(and(...conditions))
          .orderBy(desc(contributions.createdAt));

        if (!fallbackPending.length) {
          return rows;
        }

        const existingIds = new Set(rows.map((row) => row.id));
        const merged = [...rows];
        for (const fallbackRow of fallbackPending) {
          if (!existingIds.has(fallbackRow.id)) {
            merged.push({ ...fallbackRow, campaignTitle: null, needName: null });
          }
        }

        return merged;
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }

        const legacyConditions = [
          eq(contributions.type, "material"),
          or(eq(contributions.status, "pending"), isNull(contributions.status)),
        ];

        if (input?.campaignId) {
          legacyConditions.push(eq(contributions.campaignId, input.campaignId));
        }

        const legacyRows = await db
          .select({
            id: contributions.id,
            campaignId: contributions.campaignId,
          })
          .from(contributions)
          .where(and(...legacyConditions))
          .orderBy(desc(contributions.createdAt));

        const mappedLegacyRows: Array<{
          id: number;
          campaignId: number;
          campaignTitle: string | null;
          campaignNeedId: number | null;
          needName: string | null;
          donorName: string;
          donorWhatsapp: string;
          donorCity: string;
          description: string;
          quantity: string;
          quantityExact: number | null;
          estimatedAmount: number | null;
          createdAt: Date;
          paymentStatusDetail: string | null;
        }> = legacyRows.map((row) => ({
          ...row,
          campaignTitle: null,
          campaignNeedId: null,
          needName: null,
          donorName: "",
          donorWhatsapp: "",
          donorCity: "",
          description: "",
          quantity: "",
          quantityExact: null,
          estimatedAmount: null,
          createdAt: new Date(),
          paymentStatusDetail: "awaiting_triage",
        }));

        if (!fallbackPending.length) {
          return mappedLegacyRows;
        }

        const existingIds = new Set(mappedLegacyRows.map((row) => row.id));
        const merged = [...mappedLegacyRows];
        for (const fallbackRow of fallbackPending) {
          if (!existingIds.has(fallbackRow.id)) {
            merged.push({
              id: fallbackRow.id,
              campaignId: fallbackRow.campaignId,
              campaignTitle: null,
              campaignNeedId: fallbackRow.campaignNeedId ?? null,
              needName: null,
              donorName: fallbackRow.donorName ?? "",
              donorWhatsapp: fallbackRow.donorWhatsapp ?? "",
              donorCity: fallbackRow.donorCity ?? "",
              description: fallbackRow.description ?? "",
              quantity: fallbackRow.quantity ?? "",
              quantityExact: fallbackRow.quantityExact ?? null,
              estimatedAmount: fallbackRow.estimatedAmount ?? null,
              createdAt: fallbackRow.createdAt,
              paymentStatusDetail: fallbackRow.paymentStatusDetail ?? null,
            });
          }
        }

        return merged;
      }
    }),

  getRecentMaterialValidations: sectionProcedure("validations")
    .input(z.object({
      campaignId: z.number().int().positive().optional(),
      limit: z.number().int().positive().max(100).optional().default(20),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return listFallbackRecentMaterialValidations({
          campaignId: input?.campaignId,
          limit: input?.limit ?? 20,
        }).map((row) => ({ ...row, campaignTitle: null, needName: null }));
      }

      const conditions = [
        eq(contributions.type, "material"),
        inArray(contributions.paymentStatusDetail, MATERIAL_AUDIT_DETAILS),
      ];

      if (input?.campaignId) {
        conditions.push(eq(contributions.campaignId, input.campaignId));
      }

      try {
        return await db
          .select({
            id: contributions.id,
            campaignId: contributions.campaignId,
            campaignTitle: campaigns.title,
            campaignNeedId: contributions.campaignNeedId,
            needName: campaignNeeds.name,
            donorName: contributions.donorName,
            description: contributions.description,
            quantityExact: contributions.quantityExact,
            estimatedAmount: contributions.estimatedAmount,
            status: contributions.status,
            paymentStatusDetail: contributions.paymentStatusDetail,
            validatedBy: contributions.validatedBy,
            validatedAt: contributions.validatedAt,
            validationNote: contributions.validationNote,
            validatorName: users.name,
            validatorEmail: users.email,
          })
          .from(contributions)
          .leftJoin(users, eq(users.id, contributions.validatedBy))
          .leftJoin(campaigns, eq(campaigns.id, contributions.campaignId))
          .leftJoin(campaignNeeds, eq(campaignNeeds.id, contributions.campaignNeedId))
          .where(and(...conditions))
          .orderBy(desc(contributions.validatedAt), desc(contributions.updatedAt))
          .limit(input?.limit ?? 20);
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }

        const legacyConditions = [
          eq(contributions.type, "material"),
          inArray(contributions.status, ["approved", "rejected"]),
        ];

        if (input?.campaignId) {
          legacyConditions.push(eq(contributions.campaignId, input.campaignId));
        }

        const legacyRows = await db
          .select({
            id: contributions.id,
            campaignId: contributions.campaignId,
            donorName: contributions.donorName,
            description: contributions.description,
            status: contributions.status,
            createdAt: contributions.createdAt,
          })
          .from(contributions)
          .where(and(...legacyConditions))
          .orderBy(desc(contributions.createdAt))
          .limit(input?.limit ?? 20);

        return legacyRows.map((row) => ({
          id: row.id,
          campaignId: row.campaignId,
          campaignTitle: null,
          campaignNeedId: null,
          needName: null,
          donorName: row.donorName,
          description: row.description,
          quantityExact: null,
          estimatedAmount: null,
          status: row.status,
          paymentStatusDetail: row.status === "approved" ? "material_validated" : "material_rejected",
          validatedBy: null,
          validatedAt: row.createdAt,
          validationNote: null,
          validatorName: null,
          validatorEmail: null,
        }));
      }
    }),

  getRecentCashValidations: sectionProcedure("validations")
    .input(z.object({
      campaignId: z.number().int().positive().optional(),
      limit: z.number().int().positive().max(100).optional().default(20),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return listFallbackRecentCashValidations({
          campaignId: input?.campaignId,
          limit: input?.limit ?? 20,
        });
      }

      const conditions = [
        eq(contributions.type, "financial"),
        eq(contributions.paymentMethod, "cash"),
        inArray(contributions.paymentStatusDetail, CASH_AUDIT_DETAILS),
      ];

      if (input?.campaignId) {
        conditions.push(eq(contributions.campaignId, input.campaignId));
      }

      try {
        return await db
          .select({
            id: contributions.id,
            campaignId: contributions.campaignId,
            donorName: contributions.donorName,
            amount: contributions.amount,
            status: contributions.status,
            paymentStatusDetail: contributions.paymentStatusDetail,
            validatedBy: contributions.validatedBy,
            validatedAt: contributions.validatedAt,
            validationNote: contributions.validationNote,
            validatorName: users.name,
            validatorEmail: users.email,
          })
          .from(contributions)
          .leftJoin(users, eq(users.id, contributions.validatedBy))
          .where(and(...conditions))
          .orderBy(desc(contributions.validatedAt), desc(contributions.updatedAt))
          .limit(input?.limit ?? 20);
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }

        const legacyConditions = [
          eq(contributions.type, "financial"),
          eq(contributions.paymentMethod, "cash"),
          inArray(contributions.status, ["approved", "rejected"]),
        ];

        if (input?.campaignId) {
          legacyConditions.push(eq(contributions.campaignId, input.campaignId));
        }

        const legacyRows = await db
          .select({
            id: contributions.id,
            campaignId: contributions.campaignId,
            donorName: contributions.donorName,
            amount: contributions.amount,
            status: contributions.status,
            createdAt: contributions.createdAt,
          })
          .from(contributions)
          .where(and(...legacyConditions))
          .orderBy(desc(contributions.createdAt))
          .limit(input?.limit ?? 20);

        return legacyRows.map((row) => ({
          id: row.id,
          campaignId: row.campaignId,
          donorName: row.donorName,
          amount: row.amount,
          status: row.status,
          paymentStatusDetail: row.status === "approved" ? "cash_validated_in_person" : "cash_validation_rejected",
          validatedBy: null,
          validatedAt: row.createdAt,
          validationNote: null,
          validatorName: null,
          validatorEmail: null,
        }));
      }
    }),

  reviewCashContribution: sectionProcedure("validations")
    .input(z.object({
      contributionId: z.number().int().positive(),
      decision: z.enum(["approve", "reject"]),
      validationNote: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não autenticado." });
      }

      const db = await getDb();
      if (!db) {
        const fallbackReview = reviewFallbackCashContribution({
          contributionId: input.contributionId,
          decision: input.decision,
          validatedBy: ctx.user.id ?? 0,
          validatorName: ctx.user.name,
          validatorEmail: ctx.user.email,
          validationNote: input.validationNote,
        });

        if (!fallbackReview.ok) {
          if (fallbackReview.reason === "not_found") {
            throw new TRPCError({ code: "NOT_FOUND", message: "Contribuição não encontrada." });
          }

          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Esta contribuição não está pendente de validação presencial.",
          });
        }

        return {
          success: true as const,
          status: fallbackReview.status,
          contributionId: fallbackReview.contributionId,
        };
      }

      const validatedAt = new Date();
      const validationNote = input.validationNote?.trim() || null;

      let contribution: {
        id: number;
        type: string;
        status: string;
        paymentMethod: string | null;
        paymentStatusDetail: string | null;
      } | undefined;

      try {
        [contribution] = await db
          .select({
            id: contributions.id,
            type: contributions.type,
            status: contributions.status,
            paymentMethod: contributions.paymentMethod,
            paymentStatusDetail: contributions.paymentStatusDetail,
          })
          .from(contributions)
          .where(eq(contributions.id, input.contributionId))
          .limit(1);
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }

        const [legacyContribution] = await db
          .select({
            id: contributions.id,
            type: contributions.type,
            status: contributions.status,
            paymentMethod: contributions.paymentMethod,
          })
          .from(contributions)
          .where(eq(contributions.id, input.contributionId))
          .limit(1);

        contribution = legacyContribution
          ? { ...legacyContribution, paymentStatusDetail: null }
          : undefined;
      }

      if (!contribution) {
        const fallbackReview = reviewFallbackCashContribution({
          contributionId: input.contributionId,
          decision: input.decision,
          validatedBy: ctx.user.id ?? 0,
          validatorName: ctx.user.name,
          validatorEmail: ctx.user.email,
          validationNote: input.validationNote,
        });

        if (!fallbackReview.ok) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contribuição não encontrada." });
        }

        return {
          success: true as const,
          status: fallbackReview.status,
          contributionId: fallbackReview.contributionId,
        };
      }

      const isCashValidationPending =
        contribution.type === "financial"
        && contribution.status === "pending"
        && contribution.paymentMethod === "cash"
        && (
          contribution.paymentStatusDetail === "awaiting_cash_confirmation"
          || contribution.paymentStatusDetail === "awaiting_validation"
          || contribution.paymentStatusDetail === null
        );

      if (!isCashValidationPending) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Esta contribuição não está pendente de validação presencial.",
        });
      }

      if (input.decision === "approve") {
        try {
          await db
            .update(contributions)
            .set({
              status: "approved",
              paymentStatusDetail: "cash_validated_in_person",
              validatedBy: ctx.user.id ?? null,
              validatedAt,
              validationNote,
              paidAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(contributions.id, input.contributionId));
        } catch (error) {
          if (!isMissingColumnError(error)) {
            throw error;
          }

          await db
            .update(contributions)
            .set({
              status: "approved",
              paidAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(contributions.id, input.contributionId));
        }

        return { success: true as const, status: "approved" as const, contributionId: input.contributionId };
      }

      try {
        await db
          .update(contributions)
          .set({
            status: "rejected",
            paymentStatusDetail: "cash_validation_rejected",
            validatedBy: ctx.user.id ?? null,
            validatedAt,
            validationNote,
            updatedAt: new Date(),
          })
          .where(eq(contributions.id, input.contributionId));
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }

        await db
          .update(contributions)
          .set({
            status: "rejected",
            updatedAt: new Date(),
          })
          .where(eq(contributions.id, input.contributionId));
      }

      return { success: true as const, status: "rejected" as const, contributionId: input.contributionId };
    }),

  reviewMaterialContribution: sectionProcedure("validations")
    .input(z.object({
      contributionId: z.number().int().positive(),
      decision: z.enum(["approve", "reject"]),
      validationNote: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não autenticado." });
      }

      const db = await getDb();
      if (!db) {
        const fallbackReview = reviewFallbackMaterialContribution({
          contributionId: input.contributionId,
          decision: input.decision,
          validatedBy: ctx.user.id ?? 0,
          validatorName: ctx.user.name,
          validatorEmail: ctx.user.email,
          validationNote: input.validationNote,
        });

        if (!fallbackReview.ok) {
          if (fallbackReview.reason === "not_found") {
            throw new TRPCError({ code: "NOT_FOUND", message: "Contribuição não encontrada." });
          }

          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Esta contribuição de material não está pendente de validação.",
          });
        }

        return {
          success: true as const,
          status: fallbackReview.status,
          contributionId: fallbackReview.contributionId,
        };
      }

      let contribution:
        | {
          id: number;
          type: string;
          status: string;
          paymentStatusDetail: string | null;
        }
        | undefined;

      try {
        [contribution] = await db
          .select({
            id: contributions.id,
            type: contributions.type,
            status: contributions.status,
            paymentStatusDetail: contributions.paymentStatusDetail,
          })
          .from(contributions)
          .where(eq(contributions.id, input.contributionId))
          .limit(1);
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }

        const [legacyContribution] = await db
          .select({
            id: contributions.id,
            type: contributions.type,
            status: contributions.status,
          })
          .from(contributions)
          .where(eq(contributions.id, input.contributionId))
          .limit(1);

        contribution = legacyContribution
          ? { ...legacyContribution, paymentStatusDetail: null }
          : undefined;
      }

      if (!contribution) {
        const fallbackReview = reviewFallbackMaterialContribution({
          contributionId: input.contributionId,
          decision: input.decision,
          validatedBy: ctx.user.id ?? 0,
          validatorName: ctx.user.name,
          validatorEmail: ctx.user.email,
          validationNote: input.validationNote,
        });

        if (!fallbackReview.ok) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contribuição não encontrada." });
        }

        return {
          success: true as const,
          status: fallbackReview.status,
          contributionId: fallbackReview.contributionId,
        };
      }

      const isMaterialValidationPending =
        contribution.type === "material"
        && contribution.status === "pending"
        && (
          contribution.paymentStatusDetail === "awaiting_triage"
          || contribution.paymentStatusDetail === null
        );

      if (!isMaterialValidationPending) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Esta contribuição de material não está pendente de validação.",
        });
      }

      const validatedAt = new Date();
      const validationNote = input.validationNote?.trim() || null;

      if (input.decision === "approve") {
        try {
          await db
            .update(contributions)
            .set({
              status: "approved",
              paymentStatusDetail: "material_validated",
              validatedBy: ctx.user.id ?? null,
              validatedAt,
              validationNote,
              updatedAt: new Date(),
            })
            .where(eq(contributions.id, input.contributionId));
        } catch (error) {
          if (!isMissingColumnError(error)) {
            throw error;
          }

          await db
            .update(contributions)
            .set({
              status: "approved",
              updatedAt: new Date(),
            })
            .where(eq(contributions.id, input.contributionId));
        }

        return { success: true as const, status: "approved" as const, contributionId: input.contributionId };
      }

      try {
        await db
          .update(contributions)
          .set({
            status: "rejected",
            paymentStatusDetail: "material_rejected",
            validatedBy: ctx.user.id ?? null,
            validatedAt,
            validationNote,
            updatedAt: new Date(),
          })
          .where(eq(contributions.id, input.contributionId));
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }

        await db
          .update(contributions)
          .set({
            status: "rejected",
            updatedAt: new Date(),
          })
          .where(eq(contributions.id, input.contributionId));
      }

      return { success: true as const, status: "rejected" as const, contributionId: input.contributionId };
    }),
});
