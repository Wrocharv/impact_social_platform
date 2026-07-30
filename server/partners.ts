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

const defaultFallbackPartnerSeeds: Array<
  Omit<PartnerRecord, "id" | "createdAt" | "updatedAt">
> = [
  {
    name: "Predimais",
    type: "company",
    ownerName: "Saulo Goulart",
    description:
      "Parceria que conecta clientes, amigos e colaboradores para apoiar campanhas sociais recorrentes.",
    logoUrl:
      "https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=900&q=80",
    storePhotoUrl:
      "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=80",
    ownerPhotoUrl:
      "https://images.unsplash.com/photo-1542204625-de293a2f0f9b?auto=format&fit=crop&w=900&q=80",
    address: "Rua Central, 120 - Centro",
    contactInfo: "(11) 99999-0101",
    testimonialVideoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    testimonialText:
      "Nossa empresa cresceu quando decidiu crescer junto com a comunidade. Vale a pena participar.",
    website: "https://www.parceriadobem.com.br",
  },
  {
    name: "Voz da Esperança",
    type: "individual",
    ownerName: "Luciana Alves",
    description:
      "Locutora parceira que usa alcance em rádio e redes sociais para mobilizar novos doadores.",
    logoUrl:
      "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=900&q=80",
    storePhotoUrl: undefined,
    ownerPhotoUrl:
      "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=900&q=80",
    address: "São Paulo - SP",
    contactInfo: "@vozesperanca",
    testimonialVideoUrl: undefined,
    testimonialText:
      "Quando contamos histórias reais, muita gente decide ajudar. Essa ponte transforma vidas.",
    website: "https://www.instagram.com",
  },
  {
    name: "Arte em Movimento",
    type: "individual",
    ownerName: "Rafael Nunes",
    description:
      "Artista parceiro que realiza ações culturais para ampliar a visibilidade das campanhas.",
    logoUrl:
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80",
    storePhotoUrl: undefined,
    ownerPhotoUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
    address: "Rio de Janeiro - RJ",
    contactInfo: "(21) 98888-0202",
    testimonialVideoUrl: undefined,
    testimonialText:
      "A arte aproxima pessoas de causas urgentes. Fazer parte dessa rede foi uma escolha natural.",
    website: "https://www.youtube.com",
  },
];

const fallbackPartnersFile = path.resolve(process.cwd(), "server", ".partners-fallback.json");
const fallbackPartners: PartnerRecord[] = loadPartnersFromDisk();

function loadPartnersFromDisk(): PartnerRecord[] {
  try {
    const toDefaultPartners = () => {
      const now = new Date();
      return defaultFallbackPartnerSeeds.map((partner, index) => ({
        id: index + 1,
        ...partner,
        createdAt: now,
        updatedAt: now,
      }));
    };

    if (!existsSync(fallbackPartnersFile)) {
      return toDefaultPartners();
    }

    const raw = readFileSync(fallbackPartnersFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return toDefaultPartners();

    const hydrated = parsed.map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    })) as PartnerRecord[];

    const meaningful = hydrated.filter((partner) => {
      const normalizedName = partner.name?.trim().toLowerCase() || "";
      return (
        normalizedName.length > 1
        && !normalizedName.includes("localhost")
        && !normalizedName.includes("127.0.0.1")
        && normalizedName !== "parceria local"
      );
    });

    const hasShowcaseProfile = (partner: PartnerRecord) => Boolean(
      partner.ownerName
      && (
        partner.logoUrl
        || partner.ownerPhotoUrl
        || partner.storePhotoUrl
        || partner.address
        || partner.contactInfo
        || partner.testimonialText
      )
    );

    if (meaningful.length === 0 || meaningful.every((partner) => !hasShowcaseProfile(partner))) {
      return toDefaultPartners();
    }

    return meaningful;
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

    try {
      return await db
        .select()
        .from(partners)
        .orderBy(asc(partners.name), asc(partners.id));
    } catch (error) {
      console.warn("[Partners] Falling back to local data in listPublished:", error);
      return getFallbackPartners().sort((a, b) => a.name.localeCompare(b.name));
    }
  }),

  getAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return getFallbackPartners().sort((a, b) => a.name.localeCompare(b.name));
    }

    try {
      return await db
        .select()
        .from(partners)
        .orderBy(asc(partners.name), asc(partners.id));
    } catch (error) {
      console.warn("[Partners] Falling back to local data in getAll:", error);
      return getFallbackPartners().sort((a, b) => a.name.localeCompare(b.name));
    }
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
