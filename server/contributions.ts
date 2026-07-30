import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { campaignNeeds, campaigns, contributions } from "../drizzle/schema";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";

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
  description: z.string().trim().min(10).max(3000),
  ...donorInfoSchema.shape,
  campaignNeedId: z.number().int().positive().optional(),
  quantity: z.string().trim().max(255).optional(),
  deliveryMethod: z.enum(["pickup", "deliver", "mail", "other"]).optional(),
  numberOfInstallments: z.number().int().min(2).max(24).optional(),
  materialDeliveryFrequency: z.enum(["unique", "weekly", "biweekly", "monthly"]).optional(),
});

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
  if (type === "material") {
    const segments: string[] = [input.description];

    if (input.campaignNeedId) {
      const [need] = await db
        .select({ name: campaignNeeds.name, quantity: campaignNeeds.quantity })
        .from(campaignNeeds)
        .where(and(eq(campaignNeeds.id, input.campaignNeedId), eq(campaignNeeds.campaignId, input.campaignId)))
        .limit(1);

      if (!need) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Necessidade da campanha não encontrada" });
      }

      if (need.name) segments.push(`Necessidade: ${need.name}`);
      const resolvedQuantity = input.quantity?.trim() || need.quantity?.trim();
      if (resolvedQuantity) segments.push(`Quantidade: ${resolvedQuantity}`);
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
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      }

      const conditions = [
        eq(contributions.type, "financial"),
        eq(contributions.status, "pending"),
        eq(contributions.paymentMethod, "cash"),
        eq(contributions.paymentStatusDetail, "awaiting_cash_confirmation"),
      ];

      if (input?.campaignId) {
        conditions.push(eq(contributions.campaignId, input.campaignId));
      }

      return db
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
    }),

  reviewCashContribution: adminProcedure
    .input(z.object({
      contributionId: z.number().int().positive(),
      decision: z.enum(["approve", "reject"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      }

      const [contribution] = await db
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

      if (!contribution) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contribuição não encontrada." });
      }

      const isCashValidationPending =
        contribution.type === "financial"
        && contribution.status === "pending"
        && contribution.paymentMethod === "cash"
        && contribution.paymentStatusDetail === "awaiting_cash_confirmation";

      if (!isCashValidationPending) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Esta contribuição não está pendente de validação presencial.",
        });
      }

      if (input.decision === "approve") {
        await db
          .update(contributions)
          .set({
            status: "approved",
            paymentStatusDetail: "cash_validated_in_person",
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(contributions.id, input.contributionId));

        return { success: true as const, status: "approved" as const };
      }

      await db
        .update(contributions)
        .set({
          status: "rejected",
          paymentStatusDetail: "cash_validation_rejected",
          updatedAt: new Date(),
        })
        .where(eq(contributions.id, input.contributionId));

      return { success: true as const, status: "rejected" as const };
    }),
});
