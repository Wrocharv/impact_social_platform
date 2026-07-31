import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { partners } from "../drizzle/schema";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { storagePut } from "./storage";

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
  isLocalOnly?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const LOCAL_PARTNER_ID_OFFSET = 1_000_000;

const defaultFallbackPartnerSeeds: Array<
  Omit<PartnerRecord, "id" | "createdAt" | "updatedAt">
> = [
  {
    name: "A PREDIMAIS",
    type: "company",
    ownerName: "Saulo Goulart",
    description:
      "Parceria que conecta clientes, amigos e colaboradores para apoiar campanhas sociais recorrentes.",
    logoUrl:
      "/partners/predimais.jpeg",
    storePhotoUrl:
      "/partners/predimais-fachada.jpeg",
    ownerPhotoUrl:
      "/partners/predimais-interior.jpeg",
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
    name: "Múltipla Escolha",
    type: "company",
    ownerName: "Lucas Daniel Sardinha",
    description:
      "Pedras que transformam ambientes. Na Múltipla Escolha, trabalhamos com mármores e granitos para bancadas, lavatórios, escadas, revestimentos e projetos sob medida, com qualidade e excelente acabamento.",
    logoUrl: "/partners/multipla-escolha.png",
    storePhotoUrl: "/partners/multipla-escolha.png",
    ownerPhotoUrl: undefined,
    address: "",
    contactInfo: "(64) 3621-2018",
    testimonialVideoUrl: undefined,
    testimonialText: "Resp.: Lucas Daniel Sardinha",
    website: undefined,
  },
];

const fallbackPartnersFile = path.resolve(process.cwd(), "server", ".partners-fallback.json");
const defaultSeedNames = new Set(defaultFallbackPartnerSeeds.map((partner) => partner.name.trim().toLowerCase()));
const fallbackPartners: PartnerRecord[] = loadPartnersFromDisk();

function normalizePartnerKey(partner: Pick<PartnerRecord, "name" | "website">) {
  const name = partner.name.trim().toLowerCase();
  const website = (partner.website ?? "").trim().toLowerCase();
  return `${name}|${website}`;
}

function toDisplayLocalPartner(partner: PartnerRecord): PartnerRecord {
  return {
    ...partner,
    id: LOCAL_PARTNER_ID_OFFSET + partner.id,
  };
}

function fromDisplayLocalPartnerId(id: number) {
  if (id < LOCAL_PARTNER_ID_OFFSET) return null;
  return id - LOCAL_PARTNER_ID_OFFSET;
}

function getLocalOnlyFallbackPartners() {
  return fallbackPartners.filter((partner) => partner.isLocalOnly);
}

function mergeDbWithLocalFallback(dbPartners: PartnerRecord[]) {
  const dbKeys = new Set(dbPartners.map((partner) => normalizePartnerKey(partner)));
  const localPartners = getLocalOnlyFallbackPartners()
    .filter((partner) => !dbKeys.has(normalizePartnerKey(partner)))
    .map((partner) => toDisplayLocalPartner(partner));

  return [...dbPartners, ...localPartners].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.id - b.id;
  });
}

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

    const hydrated = parsed.map((item) => {
      const normalizedName = String(item?.name ?? "").trim().toLowerCase();
      const isLocalOnly = Boolean(item?.isLocalOnly) || !defaultSeedNames.has(normalizedName);
      return {
        ...item,
        isLocalOnly,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      };
    }) as PartnerRecord[];

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
    isLocalOnly: true,
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
  z.string().trim().max(512).optional(),
);

function isLikelyImageUrl(url: string) {
  const normalized = url.toLowerCase();
  return (
    /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/.test(normalized)
    || normalized.includes("images.unsplash.com")
    || normalized.includes("/manus-storage/")
  );
}

const optionalImageUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(512).optional(),
);

const partnerFields = {
  name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres").max(255),
  type: z.enum(["company", "individual"]),
  ownerName: optionalText(255),
  description: optionalText(1_500),
  logoUrl: optionalImageUrl,
  storePhotoUrl: optionalImageUrl,
  ownerPhotoUrl: optionalImageUrl,
  address: optionalText(1_000),
  contactInfo: optionalText(255),
  testimonialVideoUrl: optionalHttpUrl,
  testimonialText: optionalText(2_000),
  website: optionalHttpUrl,
};

const createPartnerSchema = z.object(partnerFields);
const uploadPartnerImageSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(5 * 1024 * 1024),
  base64: z.string().min(4).max(7_500_000),
});
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

function cleanFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, " ").trim().slice(0, 255);
}

function decodePartnerImage(file: z.infer<typeof uploadPartnerImageSchema>) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo em formato inválido." });
  }

  const buffer = Buffer.from(file.base64, "base64");
  if (buffer.length !== file.size || buffer.length > 5 * 1024 * 1024) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tamanho do arquivo inválido." });
  }

  return buffer;
}

function extensionForMimeType(mimeType: z.infer<typeof uploadPartnerImageSchema>["mimeType"]) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

function isLegacyPartnerInsertError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Unknown column|ER_BAD_FIELD_ERROR|Data too long|ER_DATA_TOO_LONG|field count doesn't match/i.test(message);
}

function buildLegacyPartnerInsert(input: z.infer<typeof createPartnerSchema>) {
  return {
    name: input.name,
    type: input.type,
    description: input.description,
    logoUrl: input.logoUrl,
    website: input.website,
  };
}

export const partnersRouter = router({
  uploadImage: adminProcedure
    .input(uploadPartnerImageSchema)
    .mutation(async ({ input }) => {
      const bytes = decodePartnerImage(input);
      const extension = extensionForMimeType(input.mimeType);
      const safeName = cleanFileName(input.fileName).replace(/\.[^.]+$/, "") || "partner-image";

      try {
        const uploaded = await storagePut(
          `partners/${Date.now()}-${safeName}.${extension}`,
          bytes,
          input.mimeType,
        );

        return {
          success: true as const,
          url: uploaded.url,
          key: uploaded.key,
        };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: error instanceof Error ? error.message : "Falha ao enviar imagem do parceiro.",
        });
      }
    }),

  listPublished: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return getFallbackPartners().sort((a, b) => a.name.localeCompare(b.name));
    }

    try {
      const dbPartners = await db
        .select()
        .from(partners)
        .orderBy(asc(partners.name), asc(partners.id));
      return mergeDbWithLocalFallback(dbPartners as PartnerRecord[]);
    } catch (error) {
      console.warn("[Partners] Falling back to local data in listPublished:", error);
      return getFallbackPartners().sort((a, b) => a.name.localeCompare(b.name));
    }
  }),

  getPublicById: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const localId = fromDisplayLocalPartnerId(input.id);
      if (localId !== null) {
        return getLocalOnlyFallbackPartners().find((partner) => partner.id === localId) ?? null;
      }

      const db = await getDb();
      if (!db) {
        return getFallbackPartners().find((partner) => partner.id === input.id) ?? null;
      }

      try {
        const [partner] = await db
          .select()
          .from(partners)
          .where(eq(partners.id, input.id))
          .limit(1);

        if (partner) return partner;
        return getLocalOnlyFallbackPartners().find((item) => item.id === input.id) ?? null;
      } catch (error) {
        console.warn("[Partners] Falling back to local data in getPublicById:", error);
        return getFallbackPartners().find((partner) => partner.id === input.id) ?? null;
      }
    }),

  getAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return getFallbackPartners().sort((a, b) => a.name.localeCompare(b.name));
    }

    try {
      const dbPartners = await db
        .select()
        .from(partners)
        .orderBy(asc(partners.name), asc(partners.id));
      return mergeDbWithLocalFallback(dbPartners as PartnerRecord[]);
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

      try {
        await db.insert(partners).values(input);
        return { success: true, message: "Parceiro cadastrado com sucesso!" };
      } catch (error) {
        console.warn("[Partners] Full insert failed, trying legacy insert:", error);

        try {
          await db.insert(partners).values(buildLegacyPartnerInsert(input));
          return { success: true, message: "Parceiro cadastrado com sucesso!" };
        } catch (legacyError) {
          console.warn("[Partners] Legacy insert failed, using local fallback:", legacyError);
          createFallbackPartner(input);
          return { success: true, message: "Parceiro cadastrado com sucesso!" };
        }
      }
    }),

  update: adminProcedure
    .input(updatePartnerSchema)
    .mutation(async ({ input }) => {
      const localId = fromDisplayLocalPartnerId(input.id);
      if (localId !== null) {
        const { id: _displayId, ...values } = input;
        const updated = updateFallbackPartner(localId, values);
        if (!updated) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Parceiro não encontrado." });
        }
        return { success: true, message: "Parceiro atualizado com sucesso!" };
      }

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
      const localId = fromDisplayLocalPartnerId(input.id);
      if (localId !== null) {
        const deleted = deleteFallbackPartner(localId);
        if (!deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Parceiro não encontrado." });
        }
        return { success: true, message: "Parceiro removido com sucesso!" };
      }

      const db = await getDb();
      if (!db) {
        const deleted = deleteFallbackPartner(input.id);
        if (!deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Parceiro não encontrado." });
        }
        return { success: true, message: "Parceiro removido com sucesso!" };
      }

      try {
        const [existingPartner] = await db
          .select({ id: partners.id })
          .from(partners)
          .where(eq(partners.id, input.id))
          .limit(1);

        if (!existingPartner) {
          const deletedFallback = deleteFallbackPartner(input.id);
          if (deletedFallback) {
            return { success: true, message: "Parceiro removido com sucesso!" };
          }

          throw new TRPCError({ code: "NOT_FOUND", message: "Parceiro não encontrado." });
        }

        await db.delete(partners).where(eq(partners.id, input.id));
        // Keep fallback storage aligned when list endpoints need to degrade to local mode.
        deleteFallbackPartner(input.id);
        return { success: true, message: "Parceiro removido com sucesso!" };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        console.warn("[Partners] Falling back to local delete:", error);
        const deletedFallback = deleteFallbackPartner(input.id);
        if (deletedFallback) {
          return { success: true, message: "Parceiro removido com sucesso!" };
        }

        throw error;
      }
    }),
});
