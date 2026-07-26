import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { getDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: getDbMock,
}));

import { appRouter } from "./routers";
import { deriveCampaignMetrics } from "./campaigns";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-1",
      name: "Responsável",
      email: "responsavel@example.org",
      role: "admin",
    } as TrpcContext["user"],
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function existingCampaignQuery(id = 10) {
  return {
    from: () => ({
      where: () => ({
        limit: vi.fn().mockResolvedValue([{ id }]),
      }),
    }),
  };
}

function createListPublishedDb() {
  const campaignRows = [
    {
      id: 10,
      title: "Campanha publicada",
      description: "Descrição pública persistida",
      longDescription: "Descrição detalhada persistida para a campanha publicada.",
      goal: 10_000,
      imageUrl: null,
      status: "active",
      createdBy: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      completedAt: null,
    },
  ];
  const contributionRows = [
    { id: 1, campaignId: 10, amount: 1_500, userId: null, donorEmail: "APOIADOR@EXAMPLE.COM" },
    { id: 2, campaignId: 10, amount: 500, userId: null, donorEmail: "apoiador@example.com" },
    { id: 3, campaignId: 10, amount: 1_500, userId: 7, donorEmail: null },
  ];
  const goalRows = [{ id: 10, goal: 10_000 }];

  let selectCall = 0;
  return {
    select: vi.fn(() => {
      selectCall += 1;
      if (selectCall === 1) {
        return {
          from: () => ({
            where: () => ({
              orderBy: () => ({ limit: async () => campaignRows }),
            }),
          }),
        };
      }
      if (selectCall === 2) {
        return {
          from: () => ({ where: async () => contributionRows }),
        };
      }
      return {
        from: () => ({ where: async () => goalRows }),
      };
    }),
  };
}

describe("deriveCampaignMetrics", () => {
  it("soma apenas valores não negativos e limita o progresso a 100%", () => {
    const result = deriveCampaignMetrics(5_000, [
      { amount: 4_000, contributorKey: "user:1" },
      { amount: 2_000, contributorKey: "user:2" },
      { amount: -500, contributorKey: "user:3" },
    ]);

    expect(result).toEqual({
      raised: 6_000,
      remaining: 0,
      progress: 100,
      contributorsCount: 3,
    });
  });

  it("retorna métricas zeradas para uma campanha sem contribuições", () => {
    expect(deriveCampaignMetrics(10_000, [])).toEqual({
      raised: 0,
      remaining: 10_000,
      progress: 0,
      contributorsCount: 0,
    });
  });
});

describe("campaigns.listPublished", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("permite leitura pública e agrega contribuições persistidas", async () => {
    getDbMock.mockResolvedValue(createListPublishedDb());
    const caller = appRouter.createCaller(createPublicContext());

    const result = await caller.campaigns.listPublished({ limit: 12 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 10,
      raised: 3_500,
      remaining: 6_500,
      progress: 35,
      contributorsCount: 2,
    });
  });
});

describe("campaigns admin", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("edita uma campanha existente e registra a conclusão", async () => {
    const where = vi.fn().mockResolvedValue({});
    const set = vi.fn(() => ({ where }));
    getDbMock.mockResolvedValue({
      select: vi.fn(() => existingCampaignQuery()),
      update: vi.fn(() => ({ set })),
    });
    const caller = appRouter.createCaller(createAdminContext());

    await caller.campaigns.update({ id: 10, status: "completed" });

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      status: "completed",
      endDate: expect.any(Date),
      updatedAt: expect.any(Date),
    }));
  });

  it("serializa somente URLs válidas ao publicar uma atualização", async () => {
    const values = vi.fn().mockResolvedValue({});
    getDbMock.mockResolvedValue({
      select: vi.fn(() => existingCampaignQuery()),
      insert: vi.fn(() => ({ values })),
    });
    const caller = appRouter.createCaller(createAdminContext());

    await caller.campaigns.createUpdate({
      campaignId: 10,
      title: "Primeira etapa concluída",
      description: "A preparação do espaço foi concluída conforme o planejamento.",
      phase: "during",
      imageUrls: ["https://example.org/obra.jpg"],
      videoUrls: [],
    });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      imageUrls: JSON.stringify(["https://example.org/obra.jpg"]),
      videoUrls: undefined,
    }));
  });

  it("cadastra uma necessidade somente em campanha existente", async () => {
    const values = vi.fn().mockResolvedValue({});
    getDbMock.mockResolvedValue({
      select: vi.fn(() => existingCampaignQuery()),
      insert: vi.fn(() => ({ values })),
    });
    const caller = appRouter.createCaller(createAdminContext());

    await caller.campaigns.createNeed({
      campaignId: 10,
      type: "material",
      name: "Cimento",
      quantity: "20 sacos",
      priority: "high",
    });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 10,
      name: "Cimento",
      priority: "high",
    }));
  });

  it("rejeita publicação relacionada a uma campanha inexistente", async () => {
    const values = vi.fn();
    getDbMock.mockResolvedValue({
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      })),
      insert: vi.fn(() => ({ values })),
    });
    const caller = appRouter.createCaller(createAdminContext());

    await expect(caller.campaigns.createNeed({
      campaignId: 999,
      type: "labor",
      name: "Pintura",
      quantity: "2 voluntários",
      priority: "medium",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(values).not.toHaveBeenCalled();
  });
});
