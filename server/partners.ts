import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { partners } from "../drizzle/schema";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";

const optionalText = (max: number) =>
  z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );

const optionalHttpUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .url("Informe uma URL válida")
    .max(512)
    .refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
      message: "A URL deve usar HTTP ou HTTPS",
    })
    .optional(),
);

const partnerFields = {
  name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres").max(255),
  type: z.enum(["company", "individual"]),
  description: optionalText(1_500),
  logoUrl: optionalHttpUrl,
  website: optionalHttpUrl,
};

const createPartnerSchema = z.object(partnerFields);
const updatePartnerSchema = z.object({
  id: z.number().int().positive(),
  name: partnerFields.name.optional(),
  type: partnerFields.type.optional(),
  description: partnerFields.description,
  logoUrl: partnerFields.logoUrl,
  website: partnerFields.website,
});

export const partnersRouter = router({
  listPublished: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select()
      .from(partners)
      .orderBy(asc(partners.name), asc(partners.id));
  }),

  getAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select()
      .from(partners)
      .orderBy(asc(partners.name), asc(partners.id));
  }),

  create: adminProcedure
    .input(createPartnerSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.insert(partners).values(input);
      return { success: true, message: "Parceiro cadastrado com sucesso!" };
    }),

  update: adminProcedure
    .input(updatePartnerSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { id, ...values } = input;
      await db
        .update(partners)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(partners.id, id));
      return { success: true, message: "Parceiro atualizado com sucesso!" };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(partners).where(eq(partners.id, input.id));
      return { success: true, message: "Parceiro removido com sucesso!" };
    }),
});
