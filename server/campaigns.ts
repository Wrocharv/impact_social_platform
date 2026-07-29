import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import {
  campaigns,
  campaignNeeds,
  campaignUpdates,
  contributions,
  transparencyDocuments,
} from "../drizzle/schema";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { whatsappService } from "./whatsapp.service";

const DEMO_CAMPAIGN = {
  id: 1,
  title: "Construção Hotel Recanto de Paz",
  description: "Apoie a construção do Hotel Recanto de Paz com materiais e contribuições para a obra.",
  longDescription:
    "A campanha apresenta uma obra real, com evolução de etapas, atualizações de fotos e necessidades concretas de materiais. Apoie a construção do Hotel Recanto de Paz em cada fase.",
  category: "infraestrutura" as const,
  goal: 10_000_00,
  imageUrl: "/obra-paredes.jpg",
  createdBy: 1,
  status: "active" as const,
  createdAt: new Date("2026-07-20T10:00:00.000Z"),
  updatedAt: new Date("2026-07-20T10:00:00.000Z"),
  raised: 0,
  remaining: 10_000_00,
  progress: 0,
  contributorsCount: 0,
  galleryImages: [
    "/obra-paredes.jpg",
    "/obra-lavanderia.jpg",
    "/obra-drone.png",
    "/render-hotel.jpg",
    "/render-quarto.jpg",
  ],
  needs: [
    {
      id: 1,
      campaignId: 1,
      type: "material" as const,
      name: "Cimento",
      description: "Materiais essenciais para a fase inicial da construção.",
      quantity: "200 sacos",
      priority: "high" as const,
      fulfilled: 30,
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

function getDemoCampaigns(status?: "active" | "completed") {
  if (!status || DEMO_CAMPAIGN.status === status) {
    return [DEMO_CAMPAIGN];
  }
  return [];
}

function getDemoCampaignById(id: number) {
  return id === DEMO_CAMPAIGN.id ? DEMO_CAMPAIGN : null;
}

function getDemoPublicStats() {
  return {
    activeCampaigns: DEMO_CAMPAIGN.status === "active" ? 1 : 0,
    raised: DEMO_CAMPAIGN.raised,
    contributorsCount: DEMO_CAMPAIGN.contributorsCount,
  };
}

function mapFallbackCampaignToPublicShape(campaign: ReturnType<typeof whatsappService.getFallbackCampaigns>[number]) {
  const goal = Number(campaign.goal ?? 0);
  const raised = Number(campaign.raised ?? 0);
  const progress = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return {
    id: campaign.id,
    title: campaign.title,
    description: campaign.description,
    longDescription: campaign.longDescription ?? campaign.description,
    category: campaign.category ?? "outro",
    goal,
    imageUrl: campaign.imageUrl ?? "/obra-paredes.jpg",
    createdBy: campaign.createdBy ?? 1,
    status: campaign.status ?? "active",
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt ?? campaign.createdAt,
    raised,
    remaining: Math.max(0, goal - raised),
    progress,
    contributorsCount: 0,
    galleryImages: [campaign.imageUrl ?? "/obra-paredes.jpg"],
    needs: [],
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

const PUBLIC_STATUSES = ["active", "completed"] as const;
const APPROVED_CONTRIBUTION_STATUSES = ["approved", "completed"] as const;

type CampaignMetrics = {
  raised: number;
  remaining: number;
  progress: number;
  contributorsCount: number;
};

export function deriveCampaignMetrics(
  goal: number,
  approvedContributions: Array<{ amount: number | null; contributorKey: string }>,
): CampaignMetrics {
  const raised = approvedContributions.reduce((total, contribution) => {
    return total + Math.max(0, contribution.amount ?? 0);
  }, 0);
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
    .select({ id: campaigns.id, goal: campaigns.goal })
    .from(campaigns)
    .where(inArray(campaigns.id, campaignIds));

  campaignRows.forEach((campaign) => {
    metrics.set(
      campaign.id,
      deriveCampaignMetrics(campaign.goal, grouped.get(campaign.id) ?? []),
    );
  });

  return metrics;
}

const createCampaignSchema = z.object({
  title: z.string().min(5, "Título deve ter pelo menos 5 caracteres"),
  description: z.string().min(20, "Descrição deve ter pelo menos 20 caracteres"),
  longDescription: z.string().min(50, "Descrição longa deve ter pelo menos 50 caracteres"),
  goal: z.number().int().positive("Meta deve ser um valor positivo"),
  imageUrl: z.string().optional(),
});

const updateCampaignSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(5).optional(),
  description: z.string().min(20).optional(),
  longDescription: z.string().min(50).optional(),
  goal: z.number().int().positive().optional(),
  status: z.enum(["active", "completed", "paused", "archived"]).optional(),
  imageUrl: z.string().nullable().optional(),
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
  quantity: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
});

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

export const campaignsRouter = router({
  getAll: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
    const metrics = await loadCampaignMetrics(
      db,
      rows.map((campaign) => campaign.id),
    );
    return rows.map((campaign) => ({
      ...campaign,
      ...(metrics.get(campaign.id) ?? deriveCampaignMetrics(campaign.goal, [])),
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
        const demoCampaigns = getDemoCampaigns(input?.status);
        const mappedFallback = getMappedFallbackCampaigns({
          status: input?.status,
          query: input?.query,
        });
        return [...demoCampaigns, ...mappedFallback].slice(0, input?.limit ?? 12);
      }

      const statusCondition = input?.status
        ? eq(campaigns.status, input.status)
        : inArray(campaigns.status, PUBLIC_STATUSES);
      const condition = input?.query
        ? and(statusCondition, like(campaigns.title, `%${input.query}%`))
        : statusCondition;

      const rows = await db
        .select()
        .from(campaigns)
        .where(condition)
        .orderBy(desc(campaigns.createdAt))
        .limit(input?.limit ?? 12);
      const metrics = await loadCampaignMetrics(
        db,
        rows.map((campaign) => campaign.id),
      );

      return rows.map((campaign) => ({
        ...campaign,
        ...(metrics.get(campaign.id) ?? deriveCampaignMetrics(campaign.goal, [])),
      }));
    }),

  getPublicStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      const fallbackCampaigns = getMappedFallbackCampaigns({ status: "active" });
      const demoStats = getDemoPublicStats();

      return {
        activeCampaigns: demoStats.activeCampaigns + fallbackCampaigns.length,
        raised: demoStats.raised + fallbackCampaigns.reduce((sum, campaign) => sum + campaign.raised, 0),
        contributorsCount:
          demoStats.contributorsCount
          + fallbackCampaigns.reduce((sum, campaign) => sum + campaign.contributorsCount, 0),
      };
    }

    const activeCampaigns = await db
      .select({ id: campaigns.id, goal: campaigns.goal })
      .from(campaigns)
      .where(eq(campaigns.status, "active"));
    const metrics = await loadCampaignMetrics(
      db,
      activeCampaigns.map((campaign) => campaign.id),
    );

    return activeCampaigns.reduce(
      (summary, campaign) => {
        const campaignMetrics =
          metrics.get(campaign.id) ?? deriveCampaignMetrics(campaign.goal, []);
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
  }),

  getById: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        const demoCampaign = getDemoCampaignById(input.id);
        if (demoCampaign) return demoCampaign;

        const fallbackCampaign = getMappedFallbackCampaigns().find((campaign) => campaign.id === input.id);
        return fallbackCampaign ?? null;
      }

      const result = await db
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.id, input.id),
            inArray(campaigns.status, PUBLIC_STATUSES),
          ),
        )
        .limit(1);
      const campaign = result[0];
      if (!campaign) return null;

      const [updates, needs, documents, metrics] = await Promise.all([
        db
          .select()
          .from(campaignUpdates)
          .where(eq(campaignUpdates.campaignId, input.id))
          .orderBy(desc(campaignUpdates.createdAt)),
        db
          .select()
          .from(campaignNeeds)
          .where(eq(campaignNeeds.campaignId, input.id))
          .orderBy(desc(campaignNeeds.priority)),
        db
          .select()
          .from(transparencyDocuments)
          .where(eq(transparencyDocuments.campaignId, input.id))
          .orderBy(desc(transparencyDocuments.uploadedAt)),
        loadCampaignMetrics(db, [input.id]),
      ]);
      const campaignMetrics =
        metrics.get(input.id) ?? deriveCampaignMetrics(campaign.goal, []);
      const galleryImages = Array.from(
        new Set(
          [
            campaign.imageUrl,
            ...updates.flatMap((update) => parseMediaUrls(update.imageUrls)),
          ].filter((url): url is string => Boolean(url)),
        ),
      );

      return {
        ...campaign,
        ...campaignMetrics,
        updates: updates.map((update) => ({
          ...update,
          images: parseMediaUrls(update.imageUrls),
          videos: parseMediaUrls(update.videoUrls),
        })),
        needs,
        documents,
        galleryImages,
      };
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
          longDescription: input.longDescription,
          imageUrl: input.imageUrl,
        });
        return { success: true, message: "Campanha criada com sucesso!" };
      }

      await db.insert(campaigns).values({
        title: input.title,
        description: input.description,
        longDescription: input.longDescription,
        goal: input.goal,
        imageUrl: input.imageUrl,
        createdBy: ctx.user.id,
        status: "active",
      });

      return { success: true, message: "Campanha criada com sucesso!" };
    }),

  update: adminProcedure
    .input(updateCampaignSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { id, ...updateData } = input;
      await requireCampaign(db, id);
      const endDate = input.status
        ? input.status === "completed"
          ? new Date()
          : null
        : undefined;
      await db
        .update(campaigns)
        .set({ ...updateData, endDate, updatedAt: new Date() })
        .where(eq(campaigns.id, id));
      return { success: true, message: "Campanha atualizada com sucesso!" };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

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
      if (!db) throw new Error("Database not available");

      await requireCampaign(db, input.campaignId);
      await db.insert(campaignNeeds).values(input);
      return { success: true, message: "Necessidade criada com sucesso!" };
    }),

  getNeeds: publicProcedure
    .input(z.object({ campaignId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db
        .select()
        .from(campaignNeeds)
        .where(eq(campaignNeeds.campaignId, input.campaignId));
    }),
});
