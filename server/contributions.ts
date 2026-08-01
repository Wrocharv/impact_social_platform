import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { campaignNeeds, campaigns, contributions, users } from "../drizzle/schema";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createFallbackCashContribution,
  listFallbackPendingCashValidations,
  listFallbackRecentCashValidations,
  reviewFallbackCashContribution,
} from "./cashValidationFallback";
import { getDb } from "./db";
import {
  createFallbackMaterialContribution,
  getFallbackMaterialTrackedQuantityForNeed,
  hasFallbackMaterialDonationForNeed,
  listFallbackPendingMaterialValidations,
  listFallbackRecentMaterialValidations,
  reviewFallbackMaterialContribution,
} from "./materialValidationFallback";
import { whatsappService } from "./whatsapp.service";

const CASH_AUDIT_DETAILS = ["cash_validated_in_person", "cash_validation_rejected"] as const;
const CASH_PENDING_DETAILS = ["awaiting_cash_confirmation", "awaiting_validation"] as const;
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
        donorEmail,
        donorWhatsapp,
        donorCity: input.donorCity,
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
      donorEmail,
      donorWhatsapp,
      donorCity: input.donorCity,
      donorChurch: input.donorChurch,
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
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      }

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

      return {
        success: true,
        message: "Doação financeira registrada. Você será redirecionado para o pagamento.",
      };
    }),

  getDonorProfileByWhatsapp: publicProcedure
    .input(z.object({ donorWhatsapp: z.string().trim().min(8).max(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      }

      const normalizedInput = input.donorWhatsapp.replace(/\D/g, "");
      if (!normalizedInput) {
        return null;
      }

      const rows = await db
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

      const match = rows.find((row) => {
        const normalizedStored = (row.donorWhatsapp || "").replace(/\D/g, "");
        return normalizedStored === normalizedInput;
      });

      if (!match) {
        return null;
      }

      return {
        donorName: match.donorName,
        donorWhatsapp: match.donorWhatsapp,
        donorEmail: match.donorEmail,
        donorCity: match.donorCity,
        donorChurch: match.donorChurch,
        allowPublicDisplay: match.allowPublicDisplay ?? false,
      };
    }),

  getDonorProfileLookup: publicProcedure
    .input(z.object({
      donorWhatsapp: z.string().trim().min(8).max(20).optional(),
      donorName: z.string().trim().min(2).max(255).optional(),
      donorEmail: z.string().trim().email().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      }

      const normalizedWhatsapp = input.donorWhatsapp?.replace(/\D/g, "") ?? "";
      const normalizedName = input.donorName?.trim().toLowerCase() ?? "";
      const normalizedEmail = input.donorEmail?.trim().toLowerCase() ?? "";

      if (!normalizedWhatsapp && normalizedName.length < 2 && !normalizedEmail) {
        return null;
      }

      const rows = await db
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

      const byEmail = normalizedEmail
        ? rows.find((row) => (row.donorEmail || "").trim().toLowerCase() === normalizedEmail)
        : undefined;

      const byWhatsapp = normalizedWhatsapp
        ? rows.find((row) => (row.donorWhatsapp || "").replace(/\D/g, "") === normalizedWhatsapp)
        : undefined;

      const byName = !byWhatsapp && normalizedName
        ? (
          rows.find((row) => (row.donorName || "").trim().toLowerCase() === normalizedName)
          || rows.find((row) => (row.donorName || "").trim().toLowerCase().includes(normalizedName))
        )
        : undefined;

      const match = byEmail ?? byWhatsapp ?? byName;
      if (!match) {
        return null;
      }

      return {
        donorName: match.donorName,
        donorWhatsapp: match.donorWhatsapp,
        donorEmail: match.donorEmail,
        donorCity: match.donorCity,
        donorChurch: match.donorChurch,
        allowPublicDisplay: match.allowPublicDisplay ?? false,
      };
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
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
    }

    return db
      .select({
        id: contributions.id,
        donorName: contributions.donorName,
        donorCity: contributions.donorCity,
        type: contributions.type,
        amount: contributions.amount,
        createdAt: contributions.createdAt,
      })
      .from(contributions)
      .where(eq(contributions.allowPublicDisplay, true))
      .orderBy(desc(contributions.createdAt))
      .limit(100);
  }),

  getPendingCashValidations: adminProcedure
    .input(z.object({ campaignId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return listFallbackPendingCashValidations(input?.campaignId);
      }

      const conditions = [
        eq(contributions.type, "financial"),
        eq(contributions.status, "pending"),
        eq(contributions.paymentMethod, "cash"),
        or(
          inArray(contributions.paymentStatusDetail, CASH_PENDING_DETAILS),
          isNull(contributions.paymentStatusDetail),
        ),
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
            donorWhatsapp: contributions.donorWhatsapp,
            donorCity: contributions.donorCity,
            amount: contributions.amount,
            createdAt: contributions.createdAt,
            paymentStatusDetail: contributions.paymentStatusDetail,
          })
          .from(contributions)
          .where(and(...conditions))
          .orderBy(desc(contributions.createdAt));
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }

        const legacyConditions = [
          eq(contributions.type, "financial"),
          eq(contributions.status, "pending"),
          eq(contributions.paymentMethod, "cash"),
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

        return legacyRows.map((row) => ({
          ...row,
          donorWhatsapp: "",
          donorCity: "",
          paymentStatusDetail: null,
        }));
      }
    }),

  getPendingMaterialValidations: adminProcedure
    .input(z.object({ campaignId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return listFallbackPendingMaterialValidations(input?.campaignId);
      }

      const conditions = [
        eq(contributions.type, "material"),
        eq(contributions.status, "pending"),
        or(
          inArray(contributions.paymentStatusDetail, MATERIAL_PENDING_DETAILS),
          isNull(contributions.paymentStatusDetail),
        ),
      ];

      if (input?.campaignId) {
        conditions.push(eq(contributions.campaignId, input.campaignId));
      }

      try {
        return await db
          .select({
            id: contributions.id,
            campaignId: contributions.campaignId,
            campaignNeedId: contributions.campaignNeedId,
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
          .where(and(...conditions))
          .orderBy(desc(contributions.createdAt));
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }

        const legacyConditions = [
          eq(contributions.type, "material"),
          eq(contributions.status, "pending"),
        ];

        if (input?.campaignId) {
          legacyConditions.push(eq(contributions.campaignId, input.campaignId));
        }

        const legacyRows = await db
          .select({
            id: contributions.id,
            campaignId: contributions.campaignId,
            donorName: contributions.donorName,
            donorWhatsapp: contributions.donorWhatsapp,
            donorCity: contributions.donorCity,
            description: contributions.description,
            createdAt: contributions.createdAt,
          })
          .from(contributions)
          .where(and(...legacyConditions))
          .orderBy(desc(contributions.createdAt));

        return legacyRows.map((row) => ({
          ...row,
          campaignNeedId: null,
          quantity: row.description,
          quantityExact: null,
          estimatedAmount: null,
          paymentStatusDetail: "awaiting_triage",
        }));
      }
    }),

  getRecentMaterialValidations: adminProcedure
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
        });
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
            campaignNeedId: contributions.campaignNeedId,
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
          campaignNeedId: null,
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

  getRecentCashValidations: adminProcedure
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

  reviewCashContribution: adminProcedure
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Contribuição não encontrada." });
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

  reviewMaterialContribution: adminProcedure
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Contribuição não encontrada." });
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
