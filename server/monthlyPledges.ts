import { TRPCError } from "@trpc/server";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { campaigns, monthlyPledgePayments, monthlyPledges } from "../drizzle/schema";
import { publicProcedure, router, sectionProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { resolvePublicCampaignId } from "./campaigns";

type Pledge = typeof monthlyPledges.$inferSelect;
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type SituacaoSocio = "atrasado" | "vence_logo" | "em_dia" | "pausado" | "concluido" | "cancelado";

const FUSO = "America/Sao_Paulo";

const createPledgeSchema = z.object({
  campaignId: z.number().int().positive(),
  fullName: z.string().trim().min(3, "Informe o nome completo").max(255),
  cpf: z.string().trim().min(11, "CPF inválido").max(14),
  email: z.string().trim().max(320).optional(),
  whatsapp: z.string().trim().min(8, "Informe um WhatsApp válido").max(20),
  city: z.string().trim().max(255).optional(),
  totalAmountCents: z.number().int().positive(),
  installments: z.number().int().min(2).max(60),
  // Melhor dia pra pagar. Ate 28 pra existir em todo mes.
  reminderDay: z.number().int().min(1).max(28).optional(),
});

/** AAAA-MM-DD no fuso do Brasil — "hoje" e "venceu" nao podem depender do fuso do servidor. */
function dataBrasil(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Vencimento da parcela `indice` (0 = primeira). A primeira vence no mes seguinte ao
 * cadastro, no dia escolhido; em mes curto, cai no ultimo dia.
 */
function vencimento(pledge: Pledge, indice: number) {
  const [ano, mes] = dataBrasil(pledge.createdAt).split("-").map(Number);
  const mesesDesdeJaneiro = mes + indice; // (mes - 1) + 1 (mes seguinte) + indice
  const a = ano + Math.floor(mesesDesdeJaneiro / 12);
  const m = (mesesDesdeJaneiro % 12) + 1;
  const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const dia = Math.min(pledge.reminderDay, ultimoDia);
  return `${a}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Em que pe esta o socio hoje: parcelas pagas, vencidas, atrasadas e o que fazer com ele. */
export function situacaoDoSocio(pledge: Pledge, totalPagoCents: number, hoje = dataBrasil(new Date())) {
  const parcela = Math.max(1, pledge.installmentAmountCents);
  const parcelasPagas = Math.min(pledge.installments, Math.floor(totalPagoCents / parcela));
  let vencidas = 0;
  while (vencidas < pledge.installments && vencimento(pledge, vencidas) <= hoje) vencidas++;
  const atrasadas = Math.max(0, vencidas - parcelasPagas);
  const primeiraEmAberto = parcelasPagas < pledge.installments ? vencimento(pledge, parcelasPagas) : null;

  let categoria: SituacaoSocio;
  if (pledge.status === "cancelled") categoria = "cancelado";
  else if (parcelasPagas >= pledge.installments || pledge.status === "completed") categoria = "concluido";
  else if (pledge.status === "paused") categoria = "pausado";
  else if (atrasadas > 0) categoria = "atrasado";
  // Vence nos proximos 7 dias e nao esta adiantado: e hora de lembrar.
  else if (primeiraEmAberto && primeiraEmAberto <= somarDias(hoje, 7)) categoria = "vence_logo";
  else categoria = "em_dia";

  return {
    categoria,
    totalPagoCents,
    parcelasPagas,
    vencidas,
    atrasadas,
    valorAtrasadoCents: atrasadas * pledge.installmentAmountCents,
    primeiraEmAberto,
  };
}

/** `installmentsPaid` e o status "concluido" seguem o que foi de fato recebido. */
async function recalcular(db: Db, pledgeId: number) {
  const [pledge] = await db.select().from(monthlyPledges).where(eq(monthlyPledges.id, pledgeId)).limit(1);
  if (!pledge) return;
  const pagamentos = await db
    .select({ amountCents: monthlyPledgePayments.amountCents })
    .from(monthlyPledgePayments)
    .where(eq(monthlyPledgePayments.pledgeId, pledgeId));
  const total = pagamentos.reduce((soma, p) => soma + p.amountCents, 0);
  const installmentsPaid = Math.min(pledge.installments, Math.floor(total / Math.max(1, pledge.installmentAmountCents)));
  let status = pledge.status;
  if (installmentsPaid >= pledge.installments && status === "active") status = "completed";
  if (installmentsPaid < pledge.installments && status === "completed") status = "active";
  await db.update(monthlyPledges).set({ installmentsPaid, status }).where(eq(monthlyPledges.id, pledgeId));
}

function quemRegistrou(ctx: unknown) {
  const sessao = (ctx as { adminSession?: { name?: string | null; email?: string | null } | null }).adminSession;
  return sessao?.name || sessao?.email || null;
}

async function dbOuErro() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível." });
  return db;
}

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
      const realCampaignId = await resolvePublicCampaignId(db, input.campaignId);

      await db.insert(monthlyPledges).values({
        campaignId: realCampaignId,
        fullName: input.fullName,
        cpf: input.cpf,
        email: input.email || null,
        whatsapp: input.whatsapp,
        city: input.city || null,
        totalAmountCents: input.totalAmountCents,
        installments: input.installments,
        installmentAmountCents,
        reminderDay: input.reminderDay ?? 5,
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

  // Tela "Socios doadores": cada compromisso com campanha, pagamentos e situacao ja calculada.
  // A conta de "em dia" fica aqui, num lugar so, pra tela e resumo nunca discordarem.
  painel: sectionProcedure("campaigns").query(async () => {
    const db = await getDb();
    if (!db) return [];

    const pledges = await db.select().from(monthlyPledges).orderBy(desc(monthlyPledges.createdAt));
    if (!pledges.length) return [];

    const pagamentos = await db
      .select()
      .from(monthlyPledgePayments)
      .where(inArray(monthlyPledgePayments.pledgeId, pledges.map((p) => p.id)))
      .orderBy(desc(monthlyPledgePayments.paidOn), desc(monthlyPledgePayments.id));
    const listaCampanhas = await db.select({ id: campaigns.id, title: campaigns.title }).from(campaigns);
    const tituloDe = new Map(listaCampanhas.map((c) => [c.id, c.title]));
    const hoje = dataBrasil(new Date());

    return pledges.map((pledge) => {
      const seus = pagamentos.filter((p) => p.pledgeId === pledge.id);
      const total = seus.reduce((soma, p) => soma + p.amountCents, 0);
      return {
        ...pledge,
        campaignTitle: tituloDe.get(pledge.campaignId) ?? "Campanha",
        pagamentos: seus,
        situacao: situacaoDoSocio(pledge, total, hoje),
      };
    });
  }),

  registrarPagamento: sectionProcedure("campaigns")
    .input(
      z.object({
        pledgeId: z.number().int().positive(),
        amountCents: z.number().int().positive(),
        paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
        method: z.enum(["pix", "dinheiro", "transferencia", "cartao", "outro"]),
        note: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOuErro();
      const [pledge] = await db.select().from(monthlyPledges).where(eq(monthlyPledges.id, input.pledgeId)).limit(1);
      if (!pledge) throw new TRPCError({ code: "NOT_FOUND", message: "Compromisso não encontrado." });

      await db.insert(monthlyPledgePayments).values({
        pledgeId: input.pledgeId,
        amountCents: input.amountCents,
        paidOn: input.paidOn,
        method: input.method,
        note: input.note || null,
        recordedBy: quemRegistrou(ctx),
      });
      await recalcular(db, input.pledgeId);
      return { success: true as const };
    }),

  // Pra corrigir um lancamento errado. Recalcula as parcelas pagas em seguida.
  removerPagamento: sectionProcedure("campaigns")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await dbOuErro();
      const [pagamento] = await db.select().from(monthlyPledgePayments).where(eq(monthlyPledgePayments.id, input.id)).limit(1);
      if (!pagamento) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado." });
      await db.delete(monthlyPledgePayments).where(eq(monthlyPledgePayments.id, input.id));
      await recalcular(db, pagamento.pledgeId);
      return { success: true as const };
    }),

  marcarLembrado: sectionProcedure("campaigns")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await dbOuErro();
      await db.update(monthlyPledges).set({ lastReminderAt: new Date() }).where(eq(monthlyPledges.id, input.id));
      return { success: true as const };
    }),

  // Botao antigo do cartao da campanha. Continua funcionando, mas agora deixa rastro: vira um
  // pagamento de uma parcela, na data de hoje, no historico.
  markInstallmentPaid: sectionProcedure("campaigns")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOuErro();

      const [pledge] = await db.select().from(monthlyPledges).where(eq(monthlyPledges.id, input.id)).limit(1);
      if (!pledge) throw new TRPCError({ code: "NOT_FOUND", message: "Compromisso não encontrado." });

      await db.insert(monthlyPledgePayments).values({
        pledgeId: pledge.id,
        amountCents: pledge.installmentAmountCents,
        paidOn: dataBrasil(new Date()),
        method: "outro",
        note: "Marcado no cartão da campanha",
        recordedBy: quemRegistrou(ctx),
      });
      await recalcular(db, pledge.id);
      return { success: true as const };
    }),

  updateStatus: sectionProcedure("campaigns")
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["active", "paused", "cancelled"]) }))
    .mutation(async ({ input }) => {
      const db = await dbOuErro();
      await db.update(monthlyPledges).set({ status: input.status }).where(eq(monthlyPledges.id, input.id));
      // Reativar quem ja pagou tudo volta direto pra "concluido".
      if (input.status === "active") await recalcular(db, input.id);
      return { success: true as const };
    }),
});
