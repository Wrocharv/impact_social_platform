import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { campaignNeeds, campaigns, contributions } from "../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";

const offerSchema = z.object({
  campaignId: z.number().int().positive(),
  description: z.string().trim().min(10).max(3000),
  donorName: z.string().trim().min(2).max(255).optional(),
  donorEmail: z.string().trim().email().optional(),
  campaignNeedId: z.number().int().positive().optional(),
  quantity: z.string().trim().max(255).optional(),
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
  const donorEmail = input.donorEmail || ctx.user?.email;
  if (!donorEmail) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Informe um e-mail para que a equipe possa entrar em contato.",
    });
  }

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
    donorName: input.donorName || ctx.user?.name || undefined,
    donorEmail,
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
});
