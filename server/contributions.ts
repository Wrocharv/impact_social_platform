import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { campaignNeeds, campaigns, contributions } from "../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";

const donorInfoSchema = z.object({
  donorName: z.string().trim().min(2).max(255),
  donorWhatsapp: z.string().trim().min(8).max(20),
  donorEmail: z.string().trim().email().optional(),
  donorCity: z.string().trim().min(2).max(255),
  donorChurch: z.string().trim().min(2).max(255).optional(),
  allowPublicDisplay: z.boolean(),
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
    allowPublicDisplay: input.allowPublicDisplay,
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
        allowPublicDisplay: input.allowPublicDisplay,
        status: "pending",
        paymentStatusDetail: "awaiting_payment",
      });

      return {
        success: true,
        message: "Doação financeira registrada. Você será redirecionado para o pagamento.",
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
      .orderBy(({ createdAt }) => ({ createdAt: "desc" }))
      .limit(100);
  }),
});
