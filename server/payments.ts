import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { campaigns, contributions } from "../drizzle/schema";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { createMercadoPagoPreference } from "./mercadopago";

const createPaymentPreferenceSchema = z.object({
  campaignId: z.number().int().positive(),
  amount: z.number().int().min(100, "Valor mínimo: R$ 1,00"),
  donorEmail: z.string().trim().email(),
  donorName: z.string().trim().min(2).max(255),
  donorWhatsapp: z.string().trim().min(8).max(20),
  donorCity: z.string().trim().min(2).max(255),
  donorChurch: z.string().trim().min(2).max(255),
});

function requestOrigin(req: {
  protocol: string;
  get(name: string): string | undefined;
}) {
  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || req.protocol;
  const host = forwardedHost || req.get("host");

  if (!host) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Host público indisponível" });
  }

  return `${protocol}://${host}`;
}

export const paymentsRouter = router({
  createPaymentPreference: publicProcedure
    .input(createPaymentPreferenceSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
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
      await db.insert(contributions).values({
        campaignId: campaign.id,
        userId: ctx.user?.id,
        type: "financial",
        amount: input.amount,
        donorName: input.donorName,
        donorEmail: input.donorEmail,
        donorWhatsapp: input.donorWhatsapp,
        donorCity: input.donorCity,
        donorChurch: input.donorChurch,
        status: "pending",
        externalReference,
        paymentStatusDetail: "preference_creating",
      });

      try {
        const preference = await createMercadoPagoPreference({
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          amountCents: input.amount,
          donorEmail: input.donorEmail,
          donorName: input.donorName,
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
        await db
          .update(contributions)
          .set({
            status: "cancelled",
            paymentStatusDetail: "preference_creation_failed",
            updatedAt: new Date(),
          })
          .where(eq(contributions.externalReference, externalReference));

        console.error("[MercadoPago] Falha ao criar preferência", error);
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "Não foi possível iniciar o checkout. Tente novamente.",
        });
      }
    }),
});
