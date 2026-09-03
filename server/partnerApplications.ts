import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { partnerApplications, partners } from "../drizzle/schema";
import { publicProcedure, router, sectionProcedure } from "./_core/trpc";
import { getDb } from "./db";

const applySchema = z.object({
  type: z.enum(["company", "individual"]),
  companyName: z.string().trim().min(2, "Informe o nome").max(255),
  segment: z.string().trim().max(255).optional(),
  contactName: z.string().trim().max(255).optional(),
  phone: z.string().trim().min(8, "Informe um telefone válido").max(30),
  email: z.string().trim().max(320).optional(),
  offer: z.string().trim().max(2_000).optional(),
  contributionKinds: z.array(z.string().trim().max(40)).max(8).optional(),
  monthlyValueCents: z.number().int().min(0).max(100_000_00).optional(),
  durationMonths: z.number().int().min(1).max(60).optional(),
  motivation: z.string().trim().max(2_000).optional(),
});

export const partnerApplicationsRouter = router({
  // Formulário público "Quero ser parceiro" — fica pendente até um admin aprovar.
  submit: publicProcedure
    .input(applySchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Não foi possível enviar agora. Tente novamente em instantes.",
        });
      }

      await db.insert(partnerApplications).values({
        type: input.type,
        companyName: input.companyName,
        // Guardado como texto simples separado por virgula: sao poucas opcoes fixas e
        // ninguem vai consultar por elas — JSON aqui so complicaria a leitura no admin.
        contributionKinds: input.contributionKinds?.length ? input.contributionKinds.join(", ") : null,
        monthlyValueCents: input.monthlyValueCents ?? null,
        durationMonths: input.durationMonths ?? null,
        motivation: input.motivation || null,
        segment: input.segment || null,
        contactName: input.contactName || null,
        phone: input.phone,
        email: input.email || null,
        offer: input.offer || null,
      });

      return { success: true as const };
    }),

  list: sectionProcedure("partners").query(async () => {
    const db = await getDb();
    if (!db) return [];

    return db
      .select()
      .from(partnerApplications)
      .where(eq(partnerApplications.status, "pending"))
      .orderBy(desc(partnerApplications.createdAt));
  }),

  approve: sectionProcedure("partners")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível." });

      const [application] = await db
        .select()
        .from(partnerApplications)
        .where(eq(partnerApplications.id, input.id))
        .limit(1);

      if (!application) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada." });
      }

      await db.insert(partners).values({
        name: application.companyName,
        type: application.type,
        ownerName: application.contactName,
        description: [application.segment, application.offer].filter(Boolean).join(" — ") || null,
        contactInfo: application.phone,
      });

      await db.delete(partnerApplications).where(eq(partnerApplications.id, input.id));
      return { success: true as const };
    }),

  reject: sectionProcedure("partners")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Banco de dados indisponível." });

      await db.delete(partnerApplications).where(eq(partnerApplications.id, input.id));
      return { success: true as const };
    }),
});
