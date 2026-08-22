import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { monthlyPledges } from "../drizzle/schema";
import { publicProcedure, router, sectionProcedure } from "./_core/trpc";
import { getDb } from "./db";

const createPledgeSchema = z.object({
  campaignId: z.number().int().positive(),
  fullName: z.string().trim().min(3, "Informe o nome completo").max(255),
  cpf: z.string().trim().min(11, "CPF inválido").max(14),
  email: z.string().trim().max(320).optional(),
  whatsapp: z.string().trim().min(8, "Informe um WhatsApp válido").max(20),
  city: z.string().trim().max(255).optional(),
  totalAmountCents: z.number().int().positive(),
  installments: z.number().int().min(2).max(60),
});

export const monthlyPledgesRouter = router({
  // Formulário público de compromisso de contribuição mensal — sem cobrança
  // automática, a pessoa autoriza ser lembrada e paga por conta própria.
  create: publicProcedure
    .input(createPledgeSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Não foi possível enviar agora. Tente novamente em instantes.",
        });
      }

      const installmentAmountCents = Math.round(input.totalAmountCents / input.installments);

      await db.insert(monthlyPledges).values({
        campaignId: input.campaignId,
        fullName: input.fullName,
        cpf: input.cpf,
        email: input.email || null,
        whatsapp: input.whatsapp,
        city: input.city || null,
        totalAmountCents: input.totalAmountCents,
        installments: input.installments,
        installmentAmountCents,
      });

      return { success: true as const, installmentAmountCents };
    }),

  // Lista tudo (todas as campanhas) — o admin filtra por campanha no cliente,
  // evitando ter que chamar um hook de query dentro de um .map() por campanha.
  list: sectionProcedure("campaigns").query(async () => {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(monthlyPledges).orderBy(desc(monthlyPledges.createdAt));
  }),

  markInstallmentPaid: sectionProcedure("campaigns")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível." });

      const [pledge] = await db.select().from(monthlyPledges).where(eq(monthlyPledges.id, input.id)).limit(1);
      if (!pledge) throw new TRPCError({ code: "NOT_FOUND", message: "Compromisso não encontrado." });

      const installmentsPaid = Math.min(pledge.installments, pledge.installmentsPaid + 1);
      const status = installmentsPaid >= pledge.installments ? "completed" : pledge.status;

      await db.update(monthlyPledges).set({ installmentsPaid, status }).where(eq(monthlyPledges.id, input.id));
      return { success: true as const };
    }),

  updateStatus: sectionProcedure("campaigns")
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["active", "paused", "cancelled"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível." });

      await db.update(monthlyPledges).set({ status: input.status }).where(eq(monthlyPledges.id, input.id));
      return { success: true as const };
    }),
});
