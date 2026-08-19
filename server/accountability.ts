import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  campaignExpenses,
  contributions,
  campaigns,
  transparencyDocuments,
  type CampaignExpense,
} from "../drizzle/schema";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { storagePut } from "./storage";
import { saveLocalCampaignUpload } from "./campaigns";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

const expenseCategorySchema = z.enum([
  "materials",
  "labor",
  "equipment",
  "services",
  "transport",
  "fees",
  "other",
  "beneficiary_transfer",
]);

const documentTypeSchema = z.enum(["invoice", "receipt", "report", "other"]);
const CONFIRMED_FINANCIAL_STATUSES = ["approved", "completed"] as const;

const uploadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  size: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
  base64: z.string().min(4).max(7_500_000),
});

export type TransparencyUpload = z.infer<typeof uploadSchema>;

function hasExpectedSignature(buffer: Buffer, mimeType: TransparencyUpload["mimeType"]) {
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

export function decodeTransparencyUpload(file: TransparencyUpload) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo codificado em formato inválido." });
  }

  const buffer = Buffer.from(file.base64, "base64");
  if (buffer.length !== file.size || buffer.length > MAX_DOCUMENT_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O tamanho do arquivo não confere." });
  }
  if (!hasExpectedSignature(buffer, file.mimeType)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O conteúdo não corresponde ao tipo informado." });
  }

  return buffer;
}

export function summarizeExpenses(expenses: Pick<CampaignExpense, "category" | "amount">[]) {
  const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const byCategory = Array.from(
    expenses.reduce((totals, expense) => {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
      return totals;
    }, new Map<CampaignExpense["category"], number>()),
  )
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return { totalSpent, byCategory };
}

function cleanFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, " ").trim().slice(0, 255);
}

/** Junta a mensagem do erro com a de suas causas encadeadas (error.cause), pra não perder o motivo real atrás de um wrapper genérico do Drizzle. */
function describeErrorWithCause(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { message?: unknown; sqlMessage?: unknown; cause?: unknown };
    const message = typeof candidate.sqlMessage === "string" ? candidate.sqlMessage : typeof candidate.message === "string" ? candidate.message : null;
    if (message && !parts.includes(message)) {
      parts.push(message);
    }
    current = candidate.cause;
  }

  return parts.length > 0 ? parts.join(" — causa: ") : "Erro desconhecido ao salvar no banco de dados.";
}

function storageExtension(mimeType: TransparencyUpload["mimeType"]) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/jpeg") return "jpg";
  return "png";
}

async function requireDatabase() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  return db;
}

async function requireCampaign(db: Awaited<ReturnType<typeof requireDatabase>>, campaignId: number, publicOnly = false) {
  const conditions = [eq(campaigns.id, campaignId)];
  if (publicOnly) conditions.push(inArray(campaigns.status, ["active", "completed"]));

  const rows = await db
    .select()
    .from(campaigns)
    .where(and(...conditions))
    .limit(1);

  const campaign = rows[0];
  if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada." });
  return campaign;
}

async function loadReport(campaignId: number, publicOnly: boolean) {
  const db = await requireDatabase();
  const campaign = await requireCampaign(db, campaignId, publicOnly);
  const [expenses, documents, confirmedEntries] = await Promise.all([
    db
      .select()
      .from(campaignExpenses)
      .where(eq(campaignExpenses.campaignId, campaignId))
      .orderBy(desc(campaignExpenses.expenseDate)),
    db
      .select()
      .from(transparencyDocuments)
      .where(eq(transparencyDocuments.campaignId, campaignId))
      .orderBy(desc(transparencyDocuments.uploadedAt)),
    db
      .select({ amount: contributions.amount })
      .from(contributions)
      .where(and(
        eq(contributions.campaignId, campaignId),
        eq(contributions.type, "financial"),
        inArray(contributions.status, CONFIRMED_FINANCIAL_STATUSES),
      )),
  ]);

  const summary = summarizeExpenses(expenses);
  // campaign.raised guarda o valor de "arrecadação inicial" digitado pelo admin (dinheiro já
  // recebido antes da campanha entrar na plataforma) — não é uma contribution de verdade, mas
  // é dinheiro real que precisa contar como entrada na prestação de contas, senão o relatório
  // subestima quanto já entrou (e o saldo disponível fica errado).
  const initialRaisedEntry = Math.max(0, campaign.raised ?? 0);
  const contributionsTotal = confirmedEntries.reduce(
    (sum, entry) => sum + Math.max(0, entry.amount ?? 0),
    0,
  );
  const totalConfirmedEntries = initialRaisedEntry + contributionsTotal;
  const availableBalance = totalConfirmedEntries - summary.totalSpent;

  return {
    campaign,
    expenses,
    documents,
    summary,
    financialSummary: {
      totalConfirmedEntries,
      initialRaisedEntry,
      confirmedContributionsCount: confirmedEntries.length,
      totalSpent: summary.totalSpent,
      availableBalance,
    },
  };
}

export const accountabilityRouter = router({
  // TEMPORARIO: diagnostico read-only, sem filtro de campanha. Remover depois.
  debugAllExpenses: publicProcedure.query(async () => {
    const db = await requireDatabase();
    const rows = await db
      .select({ id: campaignExpenses.id, campaignId: campaignExpenses.campaignId, title: campaignExpenses.title, amount: campaignExpenses.amount, category: campaignExpenses.category, createdAt: campaignExpenses.createdAt })
      .from(campaignExpenses)
      .orderBy(desc(campaignExpenses.createdAt));
    return { count: rows.length, rows };
  }),

  getPublicReport: publicProcedure
    .input(z.object({ campaignId: z.number().int().positive() }))
    .query(({ input }) => loadReport(input.campaignId, true)),

  getAdminReport: adminProcedure
    .input(z.object({ campaignId: z.number().int().positive() }))
    .query(({ input }) => loadReport(input.campaignId, false)),

  uploadDocument: adminProcedure
    .input(z.object({
      campaignId: z.number().int().positive(),
      type: documentTypeSchema,
      title: z.string().trim().min(2).max(255),
      description: z.string().trim().max(2000).optional(),
      amount: z.number().int().positive().max(2_000_000_000).optional(),
      file: uploadSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const bytes = decodeTransparencyUpload(input.file);
      const db = await requireDatabase();
      if (!ctx.user?.id) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação necessária." });
      }
      await requireCampaign(db, input.campaignId);

      const extension = storageExtension(input.file.mimeType);
      let uploaded: { url: string; key: string };
      try {
        uploaded = await storagePut(
          `campaigns/${input.campaignId}/transparency/${Date.now()}-${crypto.randomUUID()}.${extension}`,
          bytes,
          input.file.mimeType,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!/Storage config missing|BUILT_IN_FORGE_API_(URL|KEY)/i.test(message)) {
          throw new TRPCError({ code: "BAD_GATEWAY", message: describeErrorWithCause(error) });
        }
        uploaded = saveLocalCampaignUpload(cleanFileName(input.file.name), extension, bytes);
      }
      const fileName = cleanFileName(input.file.name);

      await db.insert(transparencyDocuments).values({
        campaignId: input.campaignId,
        type: input.type,
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        amount: input.amount,
        documentUrl: uploaded.url,
        storageKey: uploaded.key,
        fileName,
        mimeType: input.file.mimeType,
        fileSize: bytes.length,
        createdBy: ctx.user?.id ?? 0,
      });

      return { success: true as const, url: uploaded.url, key: uploaded.key };
    }),

  createExpense: adminProcedure
    .input(z.object({
      campaignId: z.number().int().positive(),
      category: expenseCategorySchema,
      title: z.string().trim().min(2).max(255),
      description: z.string().trim().max(2000).optional(),
      quantity: z.string().trim().max(100).optional(),
      unitPriceCents: z.number().int().positive().max(2_000_000_000).optional(),
      amount: z.number().int().positive().max(2_000_000_000),
      expenseDate: z.number().int().positive(),
      documentId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const expenseDate = new Date(input.expenseDate);
      if (Number.isNaN(expenseDate.getTime()) || expenseDate.getTime() > Date.now() + 86_400_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Data da despesa inválida." });
      }

      const db = await requireDatabase();
      await requireCampaign(db, input.campaignId);

      if (input.documentId) {
        const documentRows = await db
          .select({ id: transparencyDocuments.id })
          .from(transparencyDocuments)
          .where(and(
            eq(transparencyDocuments.id, input.documentId),
            eq(transparencyDocuments.campaignId, input.campaignId),
          ))
          .limit(1);
        if (!documentRows[0]) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Comprovante não pertence à campanha." });
        }
      }

      try {
        await db.insert(campaignExpenses).values({
          campaignId: input.campaignId,
          category: input.category,
          title: input.title.trim(),
          description: input.description?.trim() || undefined,
          quantity: input.quantity?.trim() || undefined,
          unitPriceCents: input.unitPriceCents,
          amount: input.amount,
          expenseDate,
          documentId: input.documentId,
          createdBy: ctx.user?.id ?? 0,
        });
      } catch (error) {
        console.error("[accountability.createExpense] Falha ao gravar despesa:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: describeErrorWithCause(error) });
      }

      return { success: true as const };
    }),
});
