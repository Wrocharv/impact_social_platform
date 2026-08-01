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

const CASH_AUDIT_DETAILS = ["cash_validated_in_person", "cash_validation_rejected"] as const;
const CASH_PENDING_DETAILS = ["awaiting_cash_confirmation", "awaiting_validation"] as const;

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
    (value) => (typeof value === "string" ? value.trim() : ""),
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

const TRACKED_MATERIAL_STATUSES = ["pending", "approved", "completed"] as const;

async function assertActiveCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
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
  if (type === "material") {
    const segments: string[] = [input.description];

    if (input.campaignNeedId) {
      if (!input.quantityExact) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a quantidade exata ofertada." });
      }

      const [need] = await db
        .select({
          name: campaignNeeds.name,
          quantity: campaignNeeds.quantity,
          targetQuantityExact: campaignNeeds.targetQuantityExact,
          unitValueCents: campaignNeeds.unitValueCents,
        })
        .from(campaignNeeds)
        .where(and(eq(campaignNeeds.id, input.campaignNeedId), eq(campaignNeeds.campaignId, input.campaignId)))
        .limit(1);

      if (!need) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Necessidade da campanha não encontrada" });
      }

      if (need.targetQuantityExact && need.targetQuantityExact > 0) {
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

  await db.insert(contributions).values({
    campaignId: input.campaignId,
    userId: ctx.user?.id,
    type,
    description,
    donorName: input.donorName,
    donorEmail: input.donorEmail,
    donorWhatsapp: input.donorWhatsapp,
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
        const pending = listFallbackPendingCashValidations(input?.campaignId);
        if (pending.length > 0) {
          return pending;
        }

        // Em ambiente local sem DB, semeia uma pendencia para habilitar o fluxo operacional de validacao.
        createFallbackCashContribution({
          campaignId: input?.campaignId ?? 100000,
          amount: 25_000,
          donorName: "Doador Local",
          donorWhatsapp: "(11) 99999-0000",
          donorCity: "Sao Paulo",
        });

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
      const db = await getDb();
      if (!db) {
        if (!ctx.user?.id) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não autenticado." });
        }

        const fallbackReview = reviewFallbackCashContribution({
          contributionId: input.contributionId,
          decision: input.decision,
          validatedBy: ctx.user.id,
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
      if (!ctx.user?.id) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não autenticado." });
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
              validatedBy: ctx.user.id,
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
            validatedBy: ctx.user.id,
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
