import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { partners } from "../drizzle/schema";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";

type PartnerRecord = {
  id: number;
  name: string;
  type: "company" | "individual";
  ownerName?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  storePhotoUrl?: string | null;
  ownerPhotoUrl?: string | null;
  address?: string | null;
  contactInfo?: string | null;
  testimonialVideoUrl?: string | null;
  testimonialText?: string | null;
  website?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const fallbackPartnersFile = path.resolve(process.cwd(), "server", ".partners-fallback.json");
const fallbackPartners: PartnerRecord[] = loadPartnersFromDisk();

function loadPartnersFromDisk(): PartnerRecord[] {
  try {
    if (!existsSync(fallbackPartnersFile)) return [];

    const raw = readFileSync(fallbackPartnersFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    })) as PartnerRecord[];
  } catch (error) {
    console.warn("[Partners] Unable to load fallback partners from disk:", error);
    return [];
  }
}

function persistPartnersToDisk() {
  try {
    mkdirSync(path.dirname(fallbackPartnersFile), { recursive: true });
    writeFileSync(fallbackPartnersFile, JSON.stringify(fallbackPartners, null, 2));
  } catch (error) {
    console.warn("[Partners] Unable to persist fallback partners:", error);
  }
}

function getFallbackPartners() {
  return fallbackPartners.slice();
}

function createFallbackPartner(input: Omit<PartnerRecord, "id" | "createdAt" | "updatedAt">) {
  const nextId = fallbackPartners.length > 0 ? Math.max(...fallbackPartners.map((partner) => partner.id)) + 1 : 1;
  const now = new Date();
  const partner: PartnerRecord = {
    id: nextId,
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  fallbackPartners.push(partner);
  persistPartnersToDisk();
  return partner;
}

function updateFallbackPartner(id: number, values: Partial<PartnerRecord>) {
  const index = fallbackPartners.findIndex((partner) => partner.id === id);
  if (index === -1) return null;

  fallbackPartners[index] = {
    ...fallbackPartners[index],
    ...values,
    updatedAt: new Date(),
  };
  persistPartnersToDisk();
  return fallbackPartners[index];
}

function deleteFallbackPartner(id: number) {
  const index = fallbackPartners.findIndex((partner) => partner.id === id);
  if (index === -1) return false;

  fallbackPartners.splice(index, 1);
  persistPartnersToDisk();
  return true;
}

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
  ownerName: optionalText(255),
  description: optionalText(1_500),
  logoUrl: optionalHttpUrl,
  storePhotoUrl: optionalHttpUrl,
  ownerPhotoUrl: optionalHttpUrl,
  address: optionalText(1_000),
  contactInfo: optionalText(255),
  testimonialVideoUrl: optionalHttpUrl,
  testimonialText: optionalText(2_000),
  website: optionalHttpUrl,
};

const createPartnerSchema = z.object(partnerFields);
const updatePartnerSchema = z.object({
  id: z.number().int().positive(),
  name: partnerFields.name.optional(),
  type: partnerFields.type.optional(),
  description: partnerFields.description,
  logoUrl: partnerFields.logoUrl,
  storePhotoUrl: partnerFields.storePhotoUrl,
  ownerPhotoUrl: partnerFields.ownerPhotoUrl,
  ownerName: partnerFields.ownerName,
  address: partnerFields.address,
  contactInfo: partnerFields.contactInfo,
  testimonialVideoUrl: partnerFields.testimonialVideoUrl,
  testimonialText: partnerFields.testimonialText,
  website: partnerFields.website,
});

export const partnersRouter = router({
  listPublished: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return getFallbackPartners().sort((a, b) => a.name.localeCompare(b.name));
    }

    return db
      .select()
      .from(partners)
      .orderBy(asc(partners.name), asc(partners.id));
  }),

  getAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return getFallbackPartners().sort((a, b) => a.name.localeCompare(b.name));
    }

    return db
      .select()
      .from(partners)
      .orderBy(asc(partners.name), asc(partners.id));
  }),

  create: adminProcedure
    .input(createPartnerSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        createFallbackPartner(input);
        return { success: true, message: "Parceiro cadastrado com sucesso!" };
      }

      await db.insert(partners).values(input);
      return { success: true, message: "Parceiro cadastrado com sucesso!" };
    }),

  update: adminProcedure
    .input(updatePartnerSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        const { id, ...values } = input;
        updateFallbackPartner(id, values);
        return { success: true, message: "Parceiro atualizado com sucesso!" };
      }

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
      if (!db) {
        deleteFallbackPartner(input.id);
        return { success: true, message: "Parceiro removido com sucesso!" };
      }

      await db.delete(partners).where(eq(partners.id, input.id));
      return { success: true, message: "Parceiro removido com sucesso!" };
    }),
});
