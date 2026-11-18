import { TRPCError } from "@trpc/server";
import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { monthlyPledgePayments, monthlyPledges, quickCampaigns } from "../drizzle/schema";
import { publicProcedure, router, sectionProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { situacaoDoSocio } from "./monthlyPledges";

async function dbOuErro() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível. Tente de novo em instantes." });
  return db;
}

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const campanhaSchema = z.object({
  title: z.string().trim().min(3, "Dê um nome para a campanha").max(200),
  subtitle: textoOpcional(200),
  goalCents: z.number().int().positive().nullable().optional(),
  suggestedTotalCents: z.number().int().positive().nullable().optional(),
  suggestedInstallments: z.number().int().min(1).max(60).nullable().optional(),
  allowCustomAmount: z.boolean().default(true),
  pixKey: textoOpcional(140),
  pixName: textoOpcional(120),
});

const cadastroSchema = z.object({
  quickCampaignId: z.number().int().positive(),
  fullName: z.string().trim().min(3, "Informe o nome completo").max(255),
  cpf: z.string().trim().max(14).optional(),
  email: z.string().trim().max(320).optional(),
  whatsapp: z.string().trim().min(8, "Informe um WhatsApp válido").max(20),
  city: z.string().trim().max(255).optional(),
  totalAmountCents: z.number().int().positive(),
  installments: z.number().int().min(0).max(60),
  // Entrada a vista. Com 0 parcelas, a entrada e o valor todo (pagamento a vista).
  downPaymentCents: z.number().int().min(0).default(0),
  reminderDay: z.number().int().min(1).max(28).optional(),
});

/** O que o cadastro publico precisa saber da campanha — nada de valores arrecadados. */
function publica(c: typeof quickCampaigns.$inferSelect) {
  return {
    id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    suggestedTotalCents: c.suggestedTotalCents,
    suggestedInstallments: c.suggestedInstallments,
    allowCustomAmount: c.allowCustomAmount,
    pixKey: c.pixKey,
    pixName: c.pixName,
    aberta: c.status === "active",
  };
}

export const quickCampaignsRouter = router({
  // Cadastro publico (quem le o QR do carne).
  getPublic: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = await dbOuErro();
    const [c] = await db.select().from(quickCampaigns).where(eq(quickCampaigns.id, input.id)).limit(1);
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada." });
    return publica(c);
  }),

  createPledge: publicProcedure.input(cadastroSchema).mutation(async ({ input }) => {
    const db = await dbOuErro();
    const [c] = await db.select().from(quickCampaigns).where(eq(quickCampaigns.id, input.quickCampaignId)).limit(1);
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada." });
    if (c.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Essa campanha já foi encerrada." });

    // Valor travado: vale o que esta no carne, nao o que veio do navegador.
    const travado = !c.allowCustomAmount && c.suggestedTotalCents && c.suggestedInstallments;
    const totalAmountCents = travado ? c.suggestedTotalCents! : input.totalAmountCents;
    const installments = travado && input.installments > 0 ? c.suggestedInstallments! : input.installments;
    const entrada = installments === 0 ? totalAmountCents : Math.min(input.downPaymentCents, totalAmountCents);
    if (installments > 0 && entrada >= totalAmountCents) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A entrada precisa ser menor que o valor total. Para pagar tudo de uma vez, escolha À vista." });
    }
    const installmentAmountCents = installments > 0 ? Math.round((totalAmountCents - entrada) / installments) : 0;

    await db.insert(monthlyPledges).values({
      campaignId: 0,
      quickCampaignId: c.id,
      fullName: input.fullName,
      cpf: input.cpf || "",
      email: input.email || null,
      whatsapp: input.whatsapp,
      city: input.city || null,
      totalAmountCents,
      installments,
      installmentAmountCents,
      downPaymentCents: entrada,
      reminderDay: input.reminderDay ?? 10,
    });

    return { success: true as const, totalAmountCents, installments, installmentAmountCents, downPaymentCents: entrada };
  }),

  // Painel: cada campanha rapida com o total prometido, pago, a pagar e atrasado.
  list: sectionProcedure("campaigns").query(async () => {
    const db = await getDb();
    if (!db) return [];
    const lista = await db.select().from(quickCampaigns).orderBy(desc(quickCampaigns.createdAt));
    if (!lista.length) return [];

    const pledges = await db.select().from(monthlyPledges).where(isNotNull(monthlyPledges.quickCampaignId));
    const pagamentos = pledges.length
      ? await db
          .select({ pledgeId: monthlyPledgePayments.pledgeId, amountCents: monthlyPledgePayments.amountCents })
          .from(monthlyPledgePayments)
          .where(inArray(monthlyPledgePayments.pledgeId, pledges.map((p) => p.id)))
      : [];
    const pagoPor = new Map<number, number>();
    for (const p of pagamentos) pagoPor.set(p.pledgeId, (pagoPor.get(p.pledgeId) ?? 0) + p.amountCents);

    return lista.map((c) => {
      const seus = pledges.filter((p) => p.quickCampaignId === c.id && p.status !== "cancelled");
      let prometido = 0;
      let pago = 0;
      let atrasado = 0;
      let atrasados = 0;
      let concluidos = 0;
      let entradasRecebidas = 0;
      let entradasPendentes = 0;
      for (const p of seus) {
        const totalPago = pagoPor.get(p.id) ?? 0;
        const s = situacaoDoSocio(p, totalPago);
        prometido += p.totalAmountCents;
        pago += totalPago;
        atrasado += s.valorAtrasadoCents;
        entradasRecebidas += Math.min(totalPago, s.entradaCents);
        entradasPendentes += s.entradaEmAbertoCents;
        if (s.categoria === "atrasado") atrasados++;
        if (s.categoria === "concluido") concluidos++;
      }
      return {
        ...c,
        pessoas: seus.length,
        atrasados,
        concluidos,
        prometidoCents: prometido,
        pagoCents: pago,
        aPagarCents: Math.max(0, prometido - pago),
        atrasadoCents: atrasado,
        entradasRecebidasCents: entradasRecebidas,
        entradasPendentesCents: entradasPendentes,
        parcelasRecebidasCents: pago - entradasRecebidas,
      };
    });
  }),

  // Pra preencher a chave Pix de uma campanha nova com a da ultima (o Pix e o mesmo pra todas).
  ultimoPix: sectionProcedure("campaigns").query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [c] = await db
      .select({ pixKey: quickCampaigns.pixKey, pixName: quickCampaigns.pixName })
      .from(quickCampaigns)
      .where(isNotNull(quickCampaigns.pixKey))
      .orderBy(desc(quickCampaigns.id))
      .limit(1);
    return c ?? null;
  }),

  create: sectionProcedure("campaigns")
    .input(campanhaSchema)
    .mutation(async ({ input }) => {
      const db = await dbOuErro();
      const [res] = await db.insert(quickCampaigns).values({
        ...input,
        goalCents: input.goalCents ?? null,
        suggestedTotalCents: input.suggestedTotalCents ?? null,
        suggestedInstallments: input.suggestedInstallments ?? null,
      });
      return { id: Number((res as { insertId?: number }).insertId) };
    }),

  update: sectionProcedure("campaigns")
    .input(campanhaSchema.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await dbOuErro();
      const { id, ...dados } = input;
      await db
        .update(quickCampaigns)
        .set({
          ...dados,
          goalCents: dados.goalCents ?? null,
          suggestedTotalCents: dados.suggestedTotalCents ?? null,
          suggestedInstallments: dados.suggestedInstallments ?? null,
        })
        .where(eq(quickCampaigns.id, id));
      return { success: true as const };
    }),

  setStatus: sectionProcedure("campaigns")
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["active", "closed"]) }))
    .mutation(async ({ input }) => {
      const db = await dbOuErro();
      await db.update(quickCampaigns).set({ status: input.status }).where(eq(quickCampaigns.id, input.id));
      return { success: true as const };
    }),
});
