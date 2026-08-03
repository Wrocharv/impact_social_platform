import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import {
  campaigns,
  campaignComments,
  campaignNeeds,
  campaignUpdates,
  contributions,
  transparencyDocuments,
} from "../drizzle/schema";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { listFallbackTrackedMaterialContributions } from "./materialValidationFallback";
import { storagePut } from "./storage";
import { whatsappService } from "./whatsapp.service";

const DEFAULT_VIP_APARTMENT_AMOUNT_CENTS = 120_000_00;

const DEMO_CAMPAIGN = {
  id: 100001,
  title: "Construção Hotel Recanto de Paz",
  description: "Apoie a construção do Hotel Recanto de Paz com materiais e contribuições para a obra.",
  longDescription:
    "A campanha apresenta uma obra real, com evolução de etapas, atualizações de fotos e necessidades concretas de materiais. Apoie a construção do Hotel Recanto de Paz em cada fase.",
  category: "outro" as const,
  goal: 150_000_000,
  vipApartmentAmountCents: DEFAULT_VIP_APARTMENT_AMOUNT_CENTS,
  imageUrl: "/obra-paredes.jpg",
  createdBy: 1,
  status: "active" as const,
  createdAt: new Date("2026-07-29T10:00:00.000Z"),
  updatedAt: new Date("2026-07-29T10:00:00.000Z"),
  raised: 10_025_000,
  remaining: 139_975_000,
  progress: 7,
  contributorsCount: 3,
  galleryImages: [
    "/obra-paredes.jpg",
    "/obra-lavanderia.jpg",
    "/obra-drone.png",
    "/render-hotel.jpg",
  ],
  needs: [
    {
      id: 1,
      campaignId: 1,
      type: "material" as const,
      name: "Cimento",
      description: "Materiais essenciais para a fase inicial da construção.",
      quantity: "200 sacos",
      targetQuantityExact: 200,
      unitValueCents: 4_500,
      offeredQuantity: 0,
      remainingQuantity: 200,
      offeredValueCents: 0,
      remainingValueCents: 900_000,
      priority: "high" as const,
      fulfilled: 0,
      createdAt: new Date("2026-07-20T10:00:00.000Z"),
      updatedAt: new Date("2026-07-20T10:00:00.000Z"),
    },
    {
      id: 2,
      campaignId: 100001,
      type: "material" as const,
      name: "Tijolo",
      description: "Para avanço das paredes e divisórias da obra.",
      quantity: "12.000 unidades",
      targetQuantityExact: 12000,
      unitValueCents: 120,
      offeredQuantity: 0,
      remainingQuantity: 12000,
      offeredValueCents: 0,
      remainingValueCents: 1_440_000,
      priority: "high" as const,
      fulfilled: 0,
      createdAt: new Date("2026-07-20T10:00:00.000Z"),
      updatedAt: new Date("2026-07-20T10:00:00.000Z"),
    },
  ],
  updates: [
    {
      id: 1,
      campaignId: 1,
      title: "Fundação iniciada",
      description:
        "A equipe já concluiu a marcação do terreno e iniciou a concretagem das fundações. O próximo passo será o assentamento de blocos e a chegada de mais materiais de construção.",
      phase: "before" as const,
      createdAt: new Date("2026-07-20T10:00:00.000Z"),
      imageUrls: [
        "/obra-drone.png",
      ],
      videoUrls: [],
      images: [
        "/obra-drone.png",
      ],
    },
    {
      id: 2,
      campaignId: 1,
      title: "Estrutura em andamento",
      description:
        "Já temos as primeiras divisórias e o contorno da obra visíveis. Cada nova foto mostrará a evolução real do Hotel Recanto de Paz e a contribuição dos apoiadores.",
      phase: "during" as const,
      createdAt: new Date("2026-07-21T11:00:00.000Z"),
      imageUrls: [
        "/obra-lavanderia.jpg",
      ],
      videoUrls: [],
      images: [
        "/obra-lavanderia.jpg",
      ],
    },
    {
      id: 3,
      campaignId: 1,
      title: "Obra avançando para a fase final",
      description:
        "O projeto está caminhando para a etapa de fechamento e acabamento. Esta atualização mostra como a obra evoluiu desde a fundação até as primeiras instalações relevantes.",
      phase: "after" as const,
      createdAt: new Date("2026-07-22T12:00:00.000Z"),
      imageUrls: [
        "/obra-paredes.jpg",
      ],
      videoUrls: [],
      images: [
        "/obra-paredes.jpg",
      ],
    },
  ],
  documents: [],
};

function isCanonicalRecantoCampaign(campaign: { id: number; title?: string | null }) {
  return campaign.id === DEMO_CAMPAIGN.id || (typeof campaign.title === "string" && /recanto de paz/i.test(campaign.title));
}

function withCanonicalRecantoCover<T extends { id: number; title: string; imageUrl: string | null }>(campaign: T): T {
  if (!isCanonicalRecantoCampaign(campaign)) return campaign;
  if (campaign.imageUrl && campaign.imageUrl.trim().length > 0) return campaign;
  return {
    ...campaign,
    imageUrl: DEMO_CAMPAIGN.imageUrl,
  };
}

function withFallbackRecantoContentIfEmpty<T extends {
  title: string;
  description?: string;
  longDescription?: string | null;
  category?: string | null;
  galleryImages?: string[];
  updates?: Array<Record<string, unknown>>;
  needs?: Array<Record<string, unknown>>;
}>(campaign: T): T {
  if (!isCanonicalRecantoCampaign({ id: 0, title: campaign.title })) return campaign;

  const hasUpdates = Array.isArray(campaign.updates) && campaign.updates.length > 0;
  const hasNeeds = Array.isArray(campaign.needs) && campaign.needs.length > 0;
  const hasGallery = Array.isArray(campaign.galleryImages) && campaign.galleryImages.length > 0;

  return {
    ...campaign,
    longDescription: campaign.longDescription || DEMO_CAMPAIGN.longDescription,
    category: campaign.category || DEMO_CAMPAIGN.category,
    updates: hasUpdates
      ? campaign.updates
      : DEMO_CAMPAIGN.updates.map((update) => ({
          ...update,
          images: [...update.images],
          videos: [],
        })),
    needs: hasNeeds ? campaign.needs : [...DEMO_CAMPAIGN.needs],
    galleryImages: hasGallery ? campaign.galleryImages : [...DEMO_CAMPAIGN.galleryImages],
  };
}

function withDefaultNeedsIfMissing<T extends {
  id: number;
  needs?: Array<Record<string, unknown>>;
}>(campaign: T): T {
  const hasNeeds = Array.isArray(campaign.needs) && campaign.needs.length > 0;
  if (hasNeeds) return campaign;

  return {
    ...campaign,
    needs: DEMO_CAMPAIGN.needs.map((need) => ({
      ...need,
      campaignId: campaign.id,
      offeredQuantity: 0,
      remainingQuantity: need.targetQuantityExact,
      offeredValueCents: 0,
      remainingValueCents: need.targetQuantityExact * need.unitValueCents,
      fulfilled: 0,
    })),
  };
}

function supportsMutationQueries(db: unknown): boolean {
  const candidate = db as {
    insert?: unknown;
    update?: unknown;
    delete?: unknown;
  };

  return (
    typeof candidate.insert === "function"
    && typeof candidate.update === "function"
    && typeof candidate.delete === "function"
  );
}

function getDemoCampaigns(status?: "active" | "completed") {
  const demoCampaigns = [DEMO_CAMPAIGN].filter((campaign) => {
    return !status || campaign.status === status;
  });

  if (demoCampaigns.length > 0) {
    return demoCampaigns;
  }

  return [];
}

function getDemoCampaignById(id: number) {
  if (id === DEMO_CAMPAIGN.id) return DEMO_CAMPAIGN;
  return null;
}

function mapFallbackCampaignToPublicShape(campaign: ReturnType<typeof whatsappService.getFallbackCampaigns>[number]) {
  const goal = Number(campaign.goal ?? 0);
  const initialRaised = Math.max(0, Number(campaign.raised ?? 0));
  const raised = initialRaised;
  const progress = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return {
    id: campaign.id,
    title: campaign.title,
    description: campaign.description,
    longDescription: campaign.longDescription ?? campaign.description,
    category: campaign.category ?? "outro",
    goal,
    vipApartmentAmountCents: Math.max(1, Number(campaign.vipApartmentAmountCents ?? DEFAULT_VIP_APARTMENT_AMOUNT_CENTS)),
    imageUrl: campaign.imageUrl ?? "/obra-paredes.jpg",
    createdBy: campaign.createdBy ?? 1,
    status: campaign.status ?? "active",
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt ?? campaign.createdAt,
    initialRaised,
    raised,
    remaining: Math.max(0, goal - raised),
    progress,
    contributorsCount: 0,
    galleryImages: [campaign.imageUrl ?? "/obra-paredes.jpg"],
    needs: (campaign.needs ?? []).map((need) => ({
      id: need.id,
      campaignId: campaign.id,
      type: need.type,
      name: need.name,
      description: need.description ?? null,
      quantity: need.quantity,
      targetQuantityExact: need.targetQuantityExact ?? null,
      unitValueCents: need.unitValueCents ?? null,
      priority: need.priority,
      fulfilled: need.fulfilled ?? 0,
      createdAt: campaign.createdAt,
      offeredQuantity: 0,
      remainingQuantity: Math.max(0, Number(need.targetQuantityExact ?? 0)),
      offeredValueCents: 0,
      remainingValueCents: Math.max(0, Number(need.targetQuantityExact ?? 0) * Number(need.unitValueCents ?? 0)),
    })),
    updates: [],
    documents: [],
  };
}

function getMappedFallbackCampaigns(input?: { status?: "active" | "completed"; query?: string }) {
  const query = input?.query?.trim().toLowerCase();

  return whatsappService
    .getFallbackCampaigns()
    .map(mapFallbackCampaignToPublicShape)
    .filter((campaign) => {
      if (input?.status && campaign.status !== input.status) return false;
      if (query && !campaign.title.toLowerCase().includes(query)) return false;
      return true;
    });
}

function dedupeCampaignsById<T extends { id: number }>(rows: T[]): T[] {
  const seen = new Set<number>();
  const deduped: T[] = [];

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    deduped.push(row);
  }

  return deduped;
}

function isInternalLocalSeedCampaign(campaign: { id: number; title: string }) {
  return campaign.id >= 100000 && campaign.title.trim().toLowerCase() === "campanha local inicial";
}

const PUBLIC_STATUSES = ["active", "completed"] as const;
const APPROVED_CONTRIBUTION_STATUSES = ["approved", "completed"] as const;
// Somente contribuições validadas entram no abatimento da meta de material.
const TRACKED_MATERIAL_STATUSES = ["pending", "approved", "completed"] as const;

function withMaterialProgressFromFallback<T extends { id: number; needs?: any[] }>(campaign: T): T {
  if (!Array.isArray(campaign.needs) || campaign.needs.length === 0) {
    return campaign;
  }

  const materialContributions = listFallbackTrackedMaterialContributions(campaign.id);
  if (materialContributions.length === 0) {
    return campaign;
  }

  const materialProgressByNeed = new Map<number, { offeredQuantity: number; offeredValueCents: number }>();

  materialContributions.forEach((row) => {
    if (!row.campaignNeedId) return;
    const current = materialProgressByNeed.get(row.campaignNeedId) ?? { offeredQuantity: 0, offeredValueCents: 0 };
    current.offeredQuantity += Math.max(0, row.quantityExact ?? 0);
    current.offeredValueCents += Math.max(0, row.estimatedAmount ?? 0);
    materialProgressByNeed.set(row.campaignNeedId, current);
  });

  const needsWithProgress = campaign.needs.map((need) => {
    const progress = materialProgressByNeed.get(Number(need.id)) ?? { offeredQuantity: 0, offeredValueCents: 0 };
    const targetQuantityExact = Math.max(0, Number(need.targetQuantityExact ?? 0));
    const remainingQuantity = Math.max(0, targetQuantityExact - progress.offeredQuantity);
    const unitValueCents = Math.max(0, Number(need.unitValueCents ?? 0));
    const fallbackOfferedValue = progress.offeredQuantity * unitValueCents;
    const offeredValueCents = progress.offeredValueCents > 0 ? progress.offeredValueCents : fallbackOfferedValue;
    const remainingValueCents = remainingQuantity * unitValueCents;
    const fulfilledPercent = targetQuantityExact > 0
      ? Math.min(100, Math.round((progress.offeredQuantity / targetQuantityExact) * 100))
      : 0;

    return {
      ...need,
      fulfilled: fulfilledPercent,
      offeredQuantity: progress.offeredQuantity,
      remainingQuantity,
      offeredValueCents,
      remainingValueCents,
    };
  });

  return {
    ...campaign,
    needs: needsWithProgress,
  };
}

function isMissingColumnError(error: unknown): boolean {
  const stack = [error];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") {
      continue;
    }

    const candidate = current as {
      message?: unknown;
      code?: unknown;
      sqlMessage?: unknown;
      cause?: unknown;
    };

    if (
      candidate.code === "ER_BAD_FIELD_ERROR"
      || (typeof candidate.message === "string" && candidate.message.includes("Unknown column"))
      || (typeof candidate.sqlMessage === "string" && candidate.sqlMessage.includes("Unknown column"))
    ) {
      return true;
    }

    if (candidate.cause) {
      stack.push(candidate.cause);
    }
  }

  return false;
}

type CampaignMetrics = {
  raised: number;
  remaining: number;
  progress: number;
  contributorsCount: number;
};

export function deriveCampaignMetrics(
  goal: number,
  initialRaised: number,
  approvedContributions: Array<{ amount: number | null; contributorKey: string }>,
): CampaignMetrics {
  const approvedRaised = approvedContributions.reduce((total, contribution) => {
    return total + Math.max(0, contribution.amount ?? 0);
  }, 0);
  const raised = Math.max(0, initialRaised) + approvedRaised;
  const contributorKeys = new Set(
    approvedContributions.map((contribution) => contribution.contributorKey),
  );

  return {
    raised,
    remaining: Math.max(0, goal - raised),
    progress: goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0,
    contributorsCount: contributorKeys.size,
  };
}

function parseMediaUrls(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return [];
  }
}

async function loadCampaignMetrics(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  campaignIds: number[],
) {
  const metrics = new Map<number, CampaignMetrics>();
  if (campaignIds.length === 0) return metrics;

  const rows = await db
    .select({
      id: contributions.id,
      campaignId: contributions.campaignId,
      amount: contributions.amount,
      userId: contributions.userId,
      donorEmail: contributions.donorEmail,
    })
    .from(contributions)
    .where(
      and(
        inArray(contributions.campaignId, campaignIds),
        eq(contributions.type, "financial"),
        inArray(contributions.status, APPROVED_CONTRIBUTION_STATUSES),
      ),
    );

  const grouped = new Map<
    number,
    Array<{ amount: number | null; contributorKey: string }>
  >();
  rows.forEach((row) => {
    const campaignRows = grouped.get(row.campaignId) ?? [];
    campaignRows.push({
      amount: row.amount,
      contributorKey: row.userId
        ? `user:${row.userId}`
        : row.donorEmail
          ? `email:${row.donorEmail.toLowerCase()}`
          : `contribution:${row.id}`,
    });
    grouped.set(row.campaignId, campaignRows);
  });

  const campaignRows = await db
    .select({ id: campaigns.id, goal: campaigns.goal, initialRaised: campaigns.raised })
    .from(campaigns)
    .where(inArray(campaigns.id, campaignIds));

  campaignRows.forEach((campaign) => {
    metrics.set(
      campaign.id,
      deriveCampaignMetrics(campaign.goal, campaign.initialRaised, grouped.get(campaign.id) ?? []),
    );
  });

  return metrics;
}

const createCampaignSchema = z.object({
  title: z.string().min(5, "Título deve ter pelo menos 5 caracteres"),
  description: z.string().min(20, "Descrição deve ter pelo menos 20 caracteres"),
  longDescription: z.string().min(50, "Descrição longa deve ter pelo menos 50 caracteres"),
  category: z.enum(["moradia", "educacao", "saude", "alimentacao", "infraestrutura", "outro"]).optional().default("outro"),
  goal: z.number().int().positive("Meta deve ser um valor positivo"),
  vipApartmentAmountCents: z.number().int().positive("Valor VIP deve ser um valor positivo").default(DEFAULT_VIP_APARTMENT_AMOUNT_CENTS),
  initialRaised: z.number().int().min(0).default(0),
  imageUrl: z.string().optional(),
  needs: z.array(z.object({
    type: z.enum(["material", "labor", "equipment", "other"]).default("material"),
    name: z.string().trim().min(3),
    description: z.string().trim().optional(),
    quantity: z.string().trim().min(1),
    targetQuantityExact: z.number().int().positive(),
    unitValueCents: z.number().int().positive(),
    priority: z.enum(["high", "medium", "low"]).default("medium"),
  })).default([]),
});

const VIP_MEDIA_CONFIG_TITLE = "[VIP_MEDIA_CONFIG]";

function isValidAbsoluteUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const vipMediaUrlsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) => value.startsWith("/") || isValidAbsoluteUrl(value),
        "Use uma URL válida (http/https) ou caminho local iniciando com /",
      ),
  )
  .max(10, "Informe no máximo 10 URLs")
  .default([]);

const updateCampaignSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(5).optional(),
  description: z.string().min(20).optional(),
  longDescription: z.string().min(50).optional(),
  goal: z.number().int().positive().optional(),
  vipApartmentAmountCents: z.number().int().positive().optional(),
  initialRaised: z.number().int().min(0).optional(),
  status: z.enum(["active", "completed", "paused", "archived"]).optional(),
  imageUrl: z.string().nullable().optional(),
  vipImageUrls: vipMediaUrlsSchema.optional(),
  vipVideoUrls: vipMediaUrlsSchema.optional(),
}).refine(({ id: _id, ...changes }) => Object.values(changes).some((value) => value !== undefined), {
  message: "Informe ao menos um campo para atualizar",
});

const mediaUrlsSchema = z
  .array(z.string().trim().url("URL de mídia inválida"))
  .max(10, "Informe no máximo 10 URLs")
  .default([]);

const createCampaignUpdateSchema = z.object({
  campaignId: z.number().int().positive(),
  title: z.string().min(5),
  description: z.string().min(20),
  phase: z.enum(["before", "during", "after"]),
  imageUrls: mediaUrlsSchema,
  videoUrls: mediaUrlsSchema,
});

const createCampaignNeedSchema = z.object({
  campaignId: z.number().int().positive(),
  type: z.enum(["material", "labor", "equipment", "other"]),
  name: z.string().min(3),
  description: z.string().optional(),
  quantity: z.string().trim().min(1, "Quantidade textual deve ser preenchida manualmente"),
  targetQuantityExact: z.number().int().positive("Meta exata deve ser maior que zero"),
  unitValueCents: z.number().int().positive("Valor unitário deve ser maior que zero"),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
});

const createCommentSchema = z.object({
  campaignId: z.number().int().positive(),
  content: z.string().trim().min(3, "O comentário deve ter pelo menos 3 caracteres").max(2_000),
});

const uploadCampaignImageSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(5 * 1024 * 1024),
  base64: z.string().min(4).max(7_500_000),
});

const reviewCommentSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["approved", "rejected", "pending"]),
});

function cleanFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, " ").trim().slice(0, 255);
}

function decodeCampaignImage(file: z.infer<typeof uploadCampaignImageSchema>) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo em formato inválido." });
  }

  const buffer = Buffer.from(file.base64, "base64");
  if (buffer.length !== file.size || buffer.length > 5 * 1024 * 1024) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tamanho do arquivo inválido." });
  }

  return buffer;
}

function extensionForCampaignMimeType(mimeType: z.infer<typeof uploadCampaignImageSchema>["mimeType"]) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

async function requireCampaign(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  campaignId: number,
) {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!campaign) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada" });
  }
}

async function ensureCanonicalRecantoCampaign(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
) {
  const [existing] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      or(
        eq(campaigns.title, DEMO_CAMPAIGN.title),
        like(campaigns.title, "%Recanto de Paz%"),
      ),
    )
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [createdCampaign] = await db
    .insert(campaigns)
    .values({
      title: DEMO_CAMPAIGN.title,
      description: DEMO_CAMPAIGN.description,
      longDescription: DEMO_CAMPAIGN.longDescription,
      category: DEMO_CAMPAIGN.category,
      goal: DEMO_CAMPAIGN.goal,
      vipApartmentAmountCents: DEMO_CAMPAIGN.vipApartmentAmountCents,
      raised: 0,
      imageUrl: DEMO_CAMPAIGN.imageUrl,
      createdBy: DEMO_CAMPAIGN.createdBy,
      status: DEMO_CAMPAIGN.status,
    })
    .$returningId();

  const campaignId = createdCampaign?.id;
  if (!campaignId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível restaurar a campanha do Recanto." });
  }

  for (const need of DEMO_CAMPAIGN.needs) {
    try {
      await db.insert(campaignNeeds).values({
        campaignId,
        type: need.type,
        name: need.name,
        description: need.description,
        quantity: need.quantity,
        targetQuantityExact: need.targetQuantityExact,
        unitValueCents: need.unitValueCents,
        priority: need.priority,
        fulfilled: need.fulfilled,
      });
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;

      await db.insert(campaignNeeds).values({
        campaignId,
        type: need.type,
        name: need.name,
        description: need.description,
        quantity: need.quantity,
        priority: need.priority,
        fulfilled: need.fulfilled,
      });
    }
  }

  await db.insert(campaignUpdates).values(
    DEMO_CAMPAIGN.updates.map((update) => ({
      campaignId,
      title: update.title,
      description: update.description,
      phase: update.phase,
      imageUrls: JSON.stringify(update.images ?? []),
      videoUrls: JSON.stringify(update.videoUrls ?? []),
    })),
  );

  return campaignId;
}

async function loadCampaignNeedsWithLegacyFallback(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  campaignId: number,
) {
  try {
    return await db
      .select({
        id: campaignNeeds.id,
        campaignId: campaignNeeds.campaignId,
        type: campaignNeeds.type,
        name: campaignNeeds.name,
        description: campaignNeeds.description,
        quantity: campaignNeeds.quantity,
        targetQuantityExact: campaignNeeds.targetQuantityExact,
        unitValueCents: campaignNeeds.unitValueCents,
        priority: campaignNeeds.priority,
        fulfilled: campaignNeeds.fulfilled,
        createdAt: campaignNeeds.createdAt,
      })
      .from(campaignNeeds)
      .where(eq(campaignNeeds.campaignId, campaignId))
      .orderBy(desc(campaignNeeds.priority));
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;

    const legacyNeeds = await db
      .select({
        id: campaignNeeds.id,
        campaignId: campaignNeeds.campaignId,
        type: campaignNeeds.type,
        name: campaignNeeds.name,
        description: campaignNeeds.description,
        quantity: campaignNeeds.quantity,
        priority: campaignNeeds.priority,
        fulfilled: campaignNeeds.fulfilled,
        createdAt: campaignNeeds.createdAt,
      })
      .from(campaignNeeds)
      .where(eq(campaignNeeds.campaignId, campaignId))
      .orderBy(desc(campaignNeeds.priority));

    return legacyNeeds.map((need) => ({
      ...need,
      targetQuantityExact: null,
      unitValueCents: null,
    }));
  }
}

type PublicCampaignRow = {
  id: number;
  title: string;
  description: string;
  longDescription: string | null;
  category: "moradia" | "educacao" | "saude" | "alimentacao" | "infraestrutura" | "outro" | null;
  goal: number;
  vipApartmentAmountCents: number;
  raised: number;
  status: "active" | "completed" | "paused" | "archived";
  imageUrl: string | null;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
  startDate: Date | null;
  endDate: Date | null;
};

function normalizePublicCampaignRow(
  row: Partial<PublicCampaignRow> & Pick<PublicCampaignRow, "id" | "title" | "description" | "goal" | "raised" | "status" | "createdBy" | "createdAt" | "updatedAt">,
): PublicCampaignRow {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    longDescription: row.longDescription ?? row.description,
    category: row.category ?? "outro",
    goal: row.goal,
    vipApartmentAmountCents: Math.max(1, Number(row.vipApartmentAmountCents ?? DEFAULT_VIP_APARTMENT_AMOUNT_CENTS)),
    raised: row.raised,
    status: row.status,
    imageUrl: row.imageUrl ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
  };
}

async function loadPublishedCampaignRowsWithLegacyFallback(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  condition: any,
  limit: number,
) {
  try {
    const rows = await db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        description: campaigns.description,
        longDescription: campaigns.longDescription,
        category: campaigns.category,
        goal: campaigns.goal,
        vipApartmentAmountCents: campaigns.vipApartmentAmountCents,
        raised: campaigns.raised,
        status: campaigns.status,
        imageUrl: campaigns.imageUrl,
        createdBy: campaigns.createdBy,
        createdAt: campaigns.createdAt,
        updatedAt: campaigns.updatedAt,
        startDate: campaigns.startDate,
        endDate: campaigns.endDate,
      })
      .from(campaigns)
      .where(condition)
      .orderBy(desc(campaigns.createdAt))
      .limit(limit);

    return rows.map(normalizePublicCampaignRow);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;

    const legacyRows = await db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        description: campaigns.description,
        goal: campaigns.goal,
        raised: campaigns.raised,
        status: campaigns.status,
        imageUrl: campaigns.imageUrl,
        createdBy: campaigns.createdBy,
        createdAt: campaigns.createdAt,
        updatedAt: campaigns.updatedAt,
      })
      .from(campaigns)
      .where(condition)
      .orderBy(desc(campaigns.createdAt))
      .limit(limit);

    return legacyRows.map(normalizePublicCampaignRow);
  }
}

async function loadPublicCampaignByIdWithLegacyFallback(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  campaignId: number,
) {
  const condition = and(
    eq(campaigns.id, campaignId),
    inArray(campaigns.status, PUBLIC_STATUSES),
  );

  const rows = await loadPublishedCampaignRowsWithLegacyFallback(db, condition, 1);
  return rows[0] ?? null;
}

export const campaignsRouter = router({
  uploadImage: adminProcedure
    .input(uploadCampaignImageSchema)
    .mutation(async ({ input }) => {
      const bytes = decodeCampaignImage(input);
      const extension = extensionForCampaignMimeType(input.mimeType);
      const safeName = cleanFileName(input.fileName).replace(/\.[^.]+$/, "") || "campaign-image";

      try {
        const uploaded = await storagePut(
          `campaigns/${Date.now()}-${safeName}.${extension}`,
          bytes,
          input.mimeType,
        );

        return {
          success: true as const,
          url: uploaded.url,
          key: uploaded.key,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao enviar imagem da campanha.";
        const storageNotConfigured = /Storage config missing|BUILT_IN_FORGE_API_(URL|KEY)/i.test(message);

        // Em ambiente local sem storage configurado, manter o fluxo usando data URL.
        if (storageNotConfigured && process.env.NODE_ENV !== "production") {
          return {
            success: true as const,
            url: `data:${input.mimeType};base64,${input.base64}`,
            key: `local-inline-${Date.now()}`,
          };
        }

        throw new TRPCError({
          code: "BAD_GATEWAY",
          message,
        });
      }
    }),

  getAll: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      // Admin sem DB deve mostrar apenas campanhas realmente editaveis no fallback local.
      const fallbackCampaigns = getMappedFallbackCampaigns();
      const mergedCampaigns = dedupeCampaignsById(fallbackCampaigns)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

      if (mergedCampaigns.length === 0) {
        const seededCampaign = whatsappService.createFallbackCampaign({
          title: "Campanha Local Inicial",
          description: "Campanha criada automaticamente no modo local para permitir edicao e testes do painel admin.",
          longDescription:
            "Campanha criada automaticamente no modo local para permitir edicao e testes do painel admin quando o banco estiver indisponivel.",
          category: "outro",
          goal: 500_000,
          raised: 0,
          imageUrl: "/obra-paredes.jpg",
        });

        return [mapFallbackCampaignToPublicShape(seededCampaign)];
      }

      return mergedCampaigns;
    }

    const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
    const metrics = await loadCampaignMetrics(
      db,
      rows.map((campaign) => campaign.id),
    );
    return rows.map((campaign) => ({
      ...campaign,
      initialRaised: campaign.raised,
      ...(metrics.get(campaign.id) ?? deriveCampaignMetrics(campaign.goal, campaign.raised, [])),
    }));
  }),

  listPublished: publicProcedure
    .input(
      z
        .object({
          status: z.enum(["active", "completed"]).optional(),
          query: z.string().trim().max(100).optional(),
          limit: z.number().int().min(1).max(50).default(12),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        const mappedFallback = getMappedFallbackCampaigns({
          status: input?.status,
          query: input?.query,
        }).filter((campaign) => !isInternalLocalSeedCampaign(campaign));

        const mergedCampaigns = dedupeCampaignsById(mappedFallback)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

        return mergedCampaigns.slice(0, input?.limit ?? 12);
      }

      try {
        if (supportsMutationQueries(db)) {
          await ensureCanonicalRecantoCampaign(db);
        }

        const statusCondition = input?.status
          ? eq(campaigns.status, input.status)
          : inArray(campaigns.status, PUBLIC_STATUSES);
        const condition = input?.query
          ? and(statusCondition, like(campaigns.title, `%${input.query}%`))
          : statusCondition;

        const rows = await loadPublishedCampaignRowsWithLegacyFallback(
          db,
          condition,
          input?.limit ?? 12,
        );
        const metrics = await loadCampaignMetrics(
          db,
          rows.map((campaign) => campaign.id),
        );

        const publishedRows = rows.map((campaign) => ({
          ...withCanonicalRecantoCover(campaign),
          initialRaised: campaign.raised,
          ...(metrics.get(campaign.id) ?? deriveCampaignMetrics(campaign.goal, campaign.raised, [])),
        }));

        return dedupeCampaignsById(publishedRows).slice(0, input?.limit ?? 12);
      } catch (error) {
        console.warn("[campaigns.listPublished] Falling back to local campaigns after DB error:", error);
        const mappedFallback = getMappedFallbackCampaigns({
          status: input?.status,
          query: input?.query,
        }).filter((campaign) => !isInternalLocalSeedCampaign(campaign));

        const mergedCampaigns = dedupeCampaignsById(mappedFallback)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

        return mergedCampaigns.slice(0, input?.limit ?? 12);
      }
    }),

  getPublicStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      const mappedActiveFallback = getMappedFallbackCampaigns({ status: "active" })
        .filter((campaign) => !isInternalLocalSeedCampaign(campaign));
      const mergedActiveCampaigns = dedupeCampaignsById(mappedActiveFallback);

      return {
        activeCampaigns: mergedActiveCampaigns.length,
        raised: mergedActiveCampaigns.reduce((sum, campaign) => sum + campaign.raised, 0),
        contributorsCount: mergedActiveCampaigns.reduce((sum, campaign) => sum + campaign.contributorsCount, 0),
      };
    }

    try {
      if (supportsMutationQueries(db)) {
        await ensureCanonicalRecantoCampaign(db);
      }

      const activeCampaigns = await db
        .select({ id: campaigns.id, goal: campaigns.goal, initialRaised: campaigns.raised })
        .from(campaigns)
        .where(eq(campaigns.status, "active"));
      const metrics = await loadCampaignMetrics(
        db,
        activeCampaigns.map((campaign) => campaign.id),
      );

      return activeCampaigns.reduce(
        (summary, campaign) => {
          const campaignMetrics =
            metrics.get(campaign.id) ?? deriveCampaignMetrics(campaign.goal, campaign.initialRaised, []);
          summary.raised += campaignMetrics.raised;
          summary.contributorsCount += campaignMetrics.contributorsCount;
          return summary;
        },
        {
          activeCampaigns: activeCampaigns.length,
          raised: 0,
          contributorsCount: 0,
        },
      );
    } catch (error) {
      console.warn("[campaigns.getPublicStats] Falling back to local stats after DB error:", error);
      const mappedActiveFallback = getMappedFallbackCampaigns({ status: "active" })
        .filter((campaign) => !isInternalLocalSeedCampaign(campaign));
      const mergedActiveCampaigns = dedupeCampaignsById(mappedActiveFallback);

      return {
        activeCampaigns: mergedActiveCampaigns.length,
        raised: mergedActiveCampaigns.reduce((sum, campaign) => sum + campaign.raised, 0),
        contributorsCount: mergedActiveCampaigns.reduce((sum, campaign) => sum + campaign.contributorsCount, 0),
      };
    }
  }),

  getById: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        const demoCampaign = getDemoCampaignById(input.id);
        if (demoCampaign) return withMaterialProgressFromFallback(demoCampaign);

        const fallbackCampaigns = getMappedFallbackCampaigns();
        let fallbackCampaign = fallbackCampaigns.find((campaign) => campaign.id === input.id);
        if (!fallbackCampaign && input.id === 1) {
          fallbackCampaign =
            fallbackCampaigns.find((campaign) => !/recanto de paz/i.test(campaign.title))
            ?? fallbackCampaigns.find((campaign) => campaign.id !== DEMO_CAMPAIGN.id);
        }
        if (!fallbackCampaign) return null;

        return withMaterialProgressFromFallback(withDefaultNeedsIfMissing(fallbackCampaign));
      }

      const canonicalRecantoId = await ensureCanonicalRecantoCampaign(db);
      const campaignId = input.id === DEMO_CAMPAIGN.id ? canonicalRecantoId : input.id;

      const campaign = await loadPublicCampaignByIdWithLegacyFallback(db, campaignId);
      if (!campaign) return null;

      const [updates, needs, documents, metrics, materialContributions] = await Promise.all([
        db
          .select()
          .from(campaignUpdates)
          .where(eq(campaignUpdates.campaignId, campaign.id))
          .orderBy(desc(campaignUpdates.createdAt)),
        loadCampaignNeedsWithLegacyFallback(db, campaign.id),
        db
          .select()
          .from(transparencyDocuments)
          .where(eq(transparencyDocuments.campaignId, campaign.id))
          .orderBy(desc(transparencyDocuments.uploadedAt)),
        loadCampaignMetrics(db, [campaign.id]),
        (async () => {
          try {
            return await db
              .select({
                campaignNeedId: contributions.campaignNeedId,
                quantityExact: contributions.quantityExact,
                estimatedAmount: contributions.estimatedAmount,
              })
              .from(contributions)
              .where(
                and(
                  eq(contributions.campaignId, campaign.id),
                  eq(contributions.type, "material"),
                  inArray(contributions.status, TRACKED_MATERIAL_STATUSES),
                ),
              );
          } catch (error) {
            if (!isMissingColumnError(error)) throw error;
            return [];
          }
        })(),
      ]);
      const campaignMetrics =
        metrics.get(campaign.id) ?? deriveCampaignMetrics(campaign.goal, campaign.raised, []);
      const vipMediaConfigUpdate = updates.find((update) => update.title === VIP_MEDIA_CONFIG_TITLE);
      const vipMediaImages = vipMediaConfigUpdate ? parseMediaUrls(vipMediaConfigUpdate.imageUrls) : [];
      const vipMediaVideos = vipMediaConfigUpdate ? parseMediaUrls(vipMediaConfigUpdate.videoUrls) : [];
      const galleryImages = Array.from(
        new Set(
          [
            campaign.imageUrl,
            ...vipMediaImages,
            ...updates.flatMap((update) => parseMediaUrls(update.imageUrls)),
          ].filter((url): url is string => Boolean(url)),
        ),
      );

      const canonicalizedCampaign = withCanonicalRecantoCover(campaign);
      const materialProgressByNeed = new Map<number, { offeredQuantity: number; offeredValueCents: number }>();

      materialContributions.forEach((row) => {
        if (!row.campaignNeedId) return;
        const current = materialProgressByNeed.get(row.campaignNeedId) ?? { offeredQuantity: 0, offeredValueCents: 0 };
        current.offeredQuantity += Math.max(0, row.quantityExact ?? 0);
        current.offeredValueCents += Math.max(0, row.estimatedAmount ?? 0);
        materialProgressByNeed.set(row.campaignNeedId, current);
      });

      const needsWithProgress = needs.map((need) => {
        const progress = materialProgressByNeed.get(need.id) ?? { offeredQuantity: 0, offeredValueCents: 0 };
        const targetQuantityExact = Math.max(0, need.targetQuantityExact ?? 0);
        const remainingQuantity = Math.max(0, targetQuantityExact - progress.offeredQuantity);
        const unitValueCents = Math.max(0, need.unitValueCents ?? 0);
        const fallbackOfferedValue = progress.offeredQuantity * unitValueCents;
        const offeredValueCents = progress.offeredValueCents > 0 ? progress.offeredValueCents : fallbackOfferedValue;
        const remainingValueCents = remainingQuantity * unitValueCents;
        const fulfilledPercent = targetQuantityExact > 0
          ? Math.min(100, Math.round((progress.offeredQuantity / targetQuantityExact) * 100))
          : 0;

        return {
          ...need,
          fulfilled: fulfilledPercent,
          offeredQuantity: progress.offeredQuantity,
          remainingQuantity,
          offeredValueCents,
          remainingValueCents,
        };
      });

      return withFallbackRecantoContentIfEmpty({
        ...canonicalizedCampaign,
        initialRaised: campaign.raised,
        ...campaignMetrics,
        updates: updates.map((update) => ({
          ...update,
          images: parseMediaUrls(update.imageUrls),
          videos: parseMediaUrls(update.videoUrls),
        })),
        vipMediaImages,
        vipMediaVideos,
        needs: needsWithProgress,
        documents,
        galleryImages,
      });
    }),

  create: adminProcedure
    .input(createCampaignSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      if (!db) {
        whatsappService.createFallbackCampaign({
          title: input.title,
          description: input.description,
          category: "outro",
          goal: input.goal,
          vipApartmentAmountCents: input.vipApartmentAmountCents,
          raised: input.initialRaised,
          longDescription: input.longDescription,
          imageUrl: input.imageUrl,
          needs: input.needs,
        });
        return { success: true, message: "Campanha criada com sucesso!" };
      }

      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação necessária." });
      }

      const insertResult = await db.insert(campaigns).values({
        title: input.title,
        description: input.description,
        longDescription: input.longDescription,
        category: input.category,
        goal: input.goal,
        vipApartmentAmountCents: input.vipApartmentAmountCents,
        raised: input.initialRaised,
        imageUrl: input.imageUrl,
        createdBy: userId,
        status: "active",
      });

      let createdCampaignId = Number((insertResult as { insertId?: number }).insertId ?? 0);

      if (!createdCampaignId) {
        const [recentCampaign] = await db
          .select({ id: campaigns.id })
          .from(campaigns)
          .where(and(eq(campaigns.createdBy, userId), eq(campaigns.title, input.title)))
          .orderBy(desc(campaigns.id))
          .limit(1);
        createdCampaignId = recentCampaign?.id ?? 0;
      }

      if (createdCampaignId && input.needs.length > 0) {
        await db.insert(campaignNeeds).values(
          input.needs.map((need) => ({
            campaignId: createdCampaignId,
            type: need.type,
            name: need.name,
            description: need.description,
            quantity: need.quantity,
            targetQuantityExact: need.targetQuantityExact,
            unitValueCents: need.unitValueCents,
            priority: need.priority,
          })),
        );
      }

      return { success: true, message: "Campanha criada com sucesso!" };
    }),

  update: adminProcedure
    .input(updateCampaignSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        const fallbackCampaign = whatsappService.updateFallbackCampaign(input.id, {
          title: input.title,
          description: input.description,
          longDescription: input.longDescription,
          goal: input.goal,
          vipApartmentAmountCents: input.vipApartmentAmountCents,
          raised: input.initialRaised,
          imageUrl: input.imageUrl ?? undefined,
          status: input.status,
        });

        if (!fallbackCampaign) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campanha não encontrada no modo local. Recarregue a página ou recrie a campanha neste ambiente.",
          });
        }

        return { success: true, message: "Campanha atualizada com sucesso!" };
      }

      const { id, initialRaised, vipImageUrls, vipVideoUrls, ...updateData } = input;
      await requireCampaign(db, id);
      const endDate = input.status
        ? input.status === "completed"
          ? new Date()
          : null
        : undefined;
      await db
        .update(campaigns)
        .set({ ...updateData, raised: initialRaised, endDate, updatedAt: new Date() })
        .where(eq(campaigns.id, id));

      if (vipImageUrls !== undefined || vipVideoUrls !== undefined) {
        await db
          .delete(campaignUpdates)
          .where(and(eq(campaignUpdates.campaignId, id), eq(campaignUpdates.title, VIP_MEDIA_CONFIG_TITLE)));

        const nextVipImages = vipImageUrls ?? [];
        const nextVipVideos = vipVideoUrls ?? [];
        if (nextVipImages.length > 0 || nextVipVideos.length > 0) {
          await db.insert(campaignUpdates).values({
            campaignId: id,
            title: VIP_MEDIA_CONFIG_TITLE,
            description: "Configuração interna da vitrine VIP",
            phase: "during",
            imageUrls: nextVipImages.length > 0 ? JSON.stringify(nextVipImages) : undefined,
            videoUrls: nextVipVideos.length > 0 ? JSON.stringify(nextVipVideos) : undefined,
          });
        }
      }

      return { success: true, message: "Campanha atualizada com sucesso!" };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        const deleted = whatsappService.deleteFallbackCampaign(input.id);
        if (!deleted) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campanha não encontrada no modo local.",
          });
        }

        return { success: true, message: "Campanha deletada com sucesso!" };
      }

      await requireCampaign(db, input.id);
      await db.delete(campaigns).where(eq(campaigns.id, input.id));
      return { success: true, message: "Campanha deletada com sucesso!" };
    }),

  createUpdate: adminProcedure
    .input(createCampaignUpdateSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await requireCampaign(db, input.campaignId);
      await db.insert(campaignUpdates).values({
        campaignId: input.campaignId,
        title: input.title,
        description: input.description,
        phase: input.phase,
        imageUrls: input.imageUrls.length > 0 ? JSON.stringify(input.imageUrls) : undefined,
        videoUrls: input.videoUrls.length > 0 ? JSON.stringify(input.videoUrls) : undefined,
      });
      return { success: true, message: "Atualização criada com sucesso!" };
    }),

  getUpdates: publicProcedure
    .input(z.object({ campaignId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db
        .select()
        .from(campaignUpdates)
        .where(eq(campaignUpdates.campaignId, input.campaignId))
        .orderBy(desc(campaignUpdates.createdAt));
    }),

  createNeed: adminProcedure
    .input(createCampaignNeedSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        const added = whatsappService.addFallbackCampaignNeed(input.campaignId, {
          type: input.type,
          name: input.name,
          description: input.description,
          quantity: input.quantity,
          targetQuantityExact: input.targetQuantityExact,
          unitValueCents: input.unitValueCents,
          priority: input.priority,
        });

        if (!added) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Campanha não encontrada no modo local.",
          });
        }

        return { success: true, message: "Necessidade criada com sucesso!" };
      }

      const saveNeedInFallback = () => {
        const addedFallbackNeed = whatsappService.addFallbackCampaignNeed(input.campaignId, {
          type: input.type,
          name: input.name,
          description: input.description,
          quantity: input.quantity,
          targetQuantityExact: input.targetQuantityExact,
          unitValueCents: input.unitValueCents,
          priority: input.priority,
        });
        return Boolean(addedFallbackNeed);
      };

      try {
        await requireCampaign(db, input.campaignId);
      } catch (error) {
        if (error instanceof TRPCError && error.code === "NOT_FOUND") {
          if (saveNeedInFallback()) {
            return { success: true, message: "Necessidade criada com sucesso!" };
          }
        }

        throw error;
      }

      try {
        await db.insert(campaignNeeds).values({
          ...input,
          quantity: input.quantity,
        });
      } catch (error) {
        if (isMissingColumnError(error)) {
          await db.insert(campaignNeeds).values({
            campaignId: input.campaignId,
            type: input.type,
            name: input.name,
            description: input.description,
            quantity: input.quantity,
            priority: input.priority,
          });
          return { success: true, message: "Necessidade criada com sucesso!" };
        }

        if (saveNeedInFallback()) {
          return { success: true, message: "Necessidade criada com sucesso!" };
        }

        throw error;
      }
      return { success: true, message: "Necessidade criada com sucesso!" };
    }),

  getNeeds: publicProcedure
    .input(z.object({ campaignId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        const fallbackCampaign = whatsappService
          .getFallbackCampaigns()
          .find((campaign) => campaign.id === input.campaignId);

        return (fallbackCampaign?.needs ?? []).map((need) => ({
          id: need.id,
          campaignId: input.campaignId,
          type: need.type,
          name: need.name,
          description: need.description ?? null,
          quantity: need.quantity,
          targetQuantityExact: need.targetQuantityExact ?? null,
          unitValueCents: need.unitValueCents ?? null,
          priority: need.priority,
          fulfilled: need.fulfilled ?? 0,
          createdAt: fallbackCampaign?.createdAt ?? new Date(),
        }));
      }
      const dbNeeds = await loadCampaignNeedsWithLegacyFallback(db, input.campaignId);
      if (dbNeeds.length > 0) return dbNeeds;

      const fallbackCampaign = whatsappService
        .getFallbackCampaigns()
        .find((campaign) => campaign.id === input.campaignId);

      if (!fallbackCampaign) return dbNeeds;

      return (fallbackCampaign.needs ?? []).map((need) => ({
        id: need.id,
        campaignId: input.campaignId,
        type: need.type,
        name: need.name,
        description: need.description ?? null,
        quantity: need.quantity,
        targetQuantityExact: need.targetQuantityExact ?? null,
        unitValueCents: need.unitValueCents ?? null,
        priority: need.priority,
        fulfilled: need.fulfilled ?? 0,
        createdAt: fallbackCampaign.createdAt,
      }));
    }),

  getComments: publicProcedure
    .input(z.object({ campaignId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(campaignComments)
        .where(and(eq(campaignComments.campaignId, input.campaignId), eq(campaignComments.status, "approved")))
        .orderBy(desc(campaignComments.createdAt));
    }),

  createComment: publicProcedure
    .input(createCommentSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        return { success: true, message: "Comentário registrado com sucesso!" };
      }

      await requireCampaign(db, input.campaignId);
      await db.insert(campaignComments).values({
        campaignId: input.campaignId,
        userId: ctx.user?.id,
        authorName: ctx.user?.name ?? ctx.user?.email ?? "Anônimo",
        content: input.content,
        status: ctx.user?.role === "admin" ? "approved" : "pending",
      });

      return {
        success: true,
        message: ctx.user?.role === "admin" ? "Comentário publicado com sucesso!" : "Comentário enviado para aprovação.",
      };
    }),

  reviewComment: adminProcedure
    .input(reviewCommentSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { success: true, message: "Status do comentário atualizado." };
      }

      await db
        .update(campaignComments)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(campaignComments.id, input.id));

      return { success: true, message: "Status do comentário atualizado." };
    }),
});
