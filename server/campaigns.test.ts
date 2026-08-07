import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { getDbMock, whatsappServiceMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  whatsappServiceMock: {
    getFallbackCampaigns: vi.fn(() => []),
    createFallbackCampaign: vi.fn(),
    updateFallbackCampaign: vi.fn(),
    addFallbackCampaignNeed: vi.fn(() => true),
    removeFallbackCampaignNeed: vi.fn(() => true),
    updateFallbackCampaignNeed: vi.fn(() => true),
  },
}));

vi.mock("./db", () => ({
  getDb: getDbMock,
}));

vi.mock("./whatsapp.service", () => ({
  whatsappService: whatsappServiceMock,
}));

import { appRouter } from "./routers";
import { deriveCampaignMetrics, normalizeHelpTierOptions, resolveVipContributionConfig, sanitizeLegendarioPublicCampaign } from "./campaigns";

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
  const goalRows = [{ id: 10, goal: 10_000, initialRaised: 0 }];

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

describe("normalizeHelpTierOptions", () => {
  it("retorna todas as opções por padrão quando a campanha não define nada", () => {
    expect(normalizeHelpTierOptions(undefined)).toEqual(["material", "financial", "vip"]);
  });

  it("remove duplicatas e ignora opções inválidas", () => {
    expect(normalizeHelpTierOptions(["vip", "financial", "financial", "material", "unknown"] as any)).toEqual(["material", "financial", "vip"]);
  });
});

describe("sanitizeLegendarioPublicCampaign", () => {
  it("preserva os itens cadastrados no admin para a campanha Legendário", () => {
    const result = sanitizeLegendarioPublicCampaign({
      id: 100002,
      title: "LEGENDARIO SOLIDARIO",
      needs: [{ id: 7, name: "Cadeira", targetQuantityExact: 5 }],
    } as any, {
      needs: [{ id: 99, name: "Cimento", targetQuantityExact: 10 }],
    } as any);

    expect(result.needs).toEqual([{ id: 7, name: "Cadeira", targetQuantityExact: 5 }]);
  });
});

describe("resolveVipContributionConfig", () => {
  it("usa o valor e o texto configurados quando a campanha define um VIP", () => {
    const result = resolveVipContributionConfig({
      vipApartmentAmountCents: 15_000_00,
      vipContributionTitle: "Inscrição completa",
      vipContributionSubtitle: "Acesso ao pacote completo da campanha",
      vipContributionDescription: "Escolha este fluxo para apoiar a iniciativa de forma integral.",
    } as any);

    expect(result).toMatchObject({
      amountCents: 15_000_00,
      title: "Inscrição completa",
      subtitle: "Acesso ao pacote completo da campanha",
      description: "Escolha este fluxo para apoiar a iniciativa de forma integral.",
      enabled: true,
    });
  });

  it("desabilita o VIP quando o valor não é positivo", () => {
    const result = resolveVipContributionConfig({ vipApartmentAmountCents: 0 } as any);

    expect(result.enabled).toBe(false);
    expect(result.amountCents).toBe(0);
  });
});

describe("campaigns.getById", () => {
  it("soma as doações aprovadas ao total exibido no detalhe público", async () => {
    const campaignRow = {
      id: 55,
      title: "Campanha com aprovações",
      description: "Descrição da campanha",
      longDescription: "Descrição longa da campanha",
      goal: 20_000,
      raised: 5_000,
      status: "active",
      imageUrl: null,
      createdBy: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      startDate: null,
      endDate: null,
    };

    const makeRowsQuery = (rows: Array<Record<string, unknown>>) => ({
      then: (resolve: (value: Array<Record<string, unknown>>) => unknown) => resolve(rows),
      limit: async () => rows,
      orderBy: () => makeRowsQuery(rows),
    });

    getDbMock.mockResolvedValue({
      select: vi.fn((projection: Record<string, unknown> | undefined) => {
        if (projection && Object.keys(projection).length === 1 && "id" in projection) {
          return { from: () => ({ where: () => ({ limit: async () => ([{ id: 1 }]) }) }) };
        }

        if (projection && "campaignId" in projection && "amount" in projection && "userId" in projection) {
          return { from: () => ({ where: async () => ([
            { id: 1, campaignId: 55, amount: 2_000, userId: null, donorEmail: "apoiador@example.com" },
            { id: 2, campaignId: 55, amount: 500, userId: 8, donorEmail: null },
          ]) }) };
        }

        if (projection && "campaignNeedId" in projection) {
          return { from: () => ({ where: async () => ([]) }) };
        }

        if (projection && "initialRaised" in projection && "goal" in projection && "id" in projection) {
          return {
            from: () => ({
              where: async () => ([{ id: 55, goal: 20_000, initialRaised: 5_000 }]),
            }),
          };
        }

        if (projection && "title" in projection && "description" in projection && "goal" in projection) {
          return { from: () => ({ where: () => makeRowsQuery([campaignRow]) }) };
        }

        return { from: () => ({ where: () => makeRowsQuery([]) }) };
      }),
    });

    const caller = appRouter.createCaller(createPublicContext());
    const detail = await caller.campaigns.getById({ id: 55 });

    expect(detail).not.toBeNull();
    expect(detail).toMatchObject({
      id: 55,
      initialRaised: 5_000,
      raised: 7_500,
      remaining: 12_500,
      progress: 38,
      contributorsCount: 2,
    });
  });

  it("preserva a visibilidade do VIP quando a campanha define helpTierOptions", async () => {
    const dbRows = [{
      id: 55,
      title: "Campanha VIP desligado",
      description: "Descrição da campanha",
      longDescription: "Descrição longa da campanha",
      goal: 20_000,
      vipApartmentAmountCents: 7_500_00,
      raised: 0,
      helpTierOptions: ["material", "financial"],
      status: "active",
      imageUrl: null,
      createdBy: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      startDate: null,
      endDate: null,
    }];

    const createQueryChain = (rows: Array<Record<string, unknown>>) => {
      const chain: Record<string, unknown> = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: vi.fn().mockResolvedValue(rows),
      };
      (chain as { then?: (resolve: (value: unknown) => unknown) => unknown }).then = (resolve) => resolve(rows);
      return chain as {
        from: () => unknown;
        where: () => unknown;
        orderBy: () => unknown;
        limit: ReturnType<typeof vi.fn>;
        then: (resolve: (value: unknown) => unknown) => unknown;
      };
    };

    getDbMock.mockResolvedValue({
      select: vi.fn((projection: Record<string, unknown>) => {
        if (projection && "helpTierOptions" in projection) {
          return createQueryChain([{ ...dbRows[0], helpTierOptions: ["material", "financial"] }]);
        }

        if (projection && "campaignId" in projection && "amount" in projection) {
          return createQueryChain([]);
        }

        return createQueryChain(dbRows as Array<Record<string, unknown>>);
      }),
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.campaigns.getById({ id: 55 });

    expect(result?.helpTierOptions).toEqual(["material", "financial"]);
  });
});

describe("deriveCampaignMetrics", () => {
  it("soma apenas valores não negativos e limita o progresso a 100%", () => {
    const result = deriveCampaignMetrics(5_000, 500, [
      { amount: 4_000, contributorKey: "user:1" },
      { amount: 2_000, contributorKey: "user:2" },
      { amount: -500, contributorKey: "user:3" },
    ]);

    expect(result).toEqual({
      raised: 6_500,
      remaining: 0,
      progress: 100,
      contributorsCount: 3,
    });
  });

  it("retorna métricas zeradas para uma campanha sem contribuições", () => {
    expect(deriveCampaignMetrics(10_000, 0, [])).toEqual({
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
    whatsappServiceMock.getFallbackCampaigns.mockReset();
    whatsappServiceMock.getFallbackCampaigns.mockReturnValue([]);
  });

  it("permite leitura pública e agrega contribuições persistidas", async () => {
    getDbMock.mockResolvedValue(createListPublishedDb());
    const caller = appRouter.createCaller(createPublicContext());

    const result = await caller.campaigns.listPublished({ limit: 12 });
    const persistedCampaign = result.find((campaign) => campaign.id === 10);

    expect(persistedCampaign).toMatchObject({
      id: 10,
      raised: 3_500,
      remaining: 6_500,
      progress: 35,
      contributorsCount: 2,
    });
  });

  it("expõe campanhas de fallback no detalhe e nas estatísticas públicas", async () => {
    getDbMock.mockResolvedValue(null);
    whatsappServiceMock.getFallbackCampaigns.mockReturnValue([{
      id: 99,
      title: "LEGENDARIO SOLIDARIO",
      description: "Campanha para arrecadar recursos para a inscrição e itens do kit.",
      longDescription: "Campanha para arrecadar recursos para a inscrição e itens do kit.",
      category: "outro",
      goal: 500_000,
      raised: 0,
      status: "active" as const,
      imageUrl: "/IMG_3283.JPG",
      createdBy: 1,
      createdAt: new Date("2026-07-28T00:00:00.000Z"),
      updatedAt: new Date("2026-07-28T00:00:00.000Z"),
    }]);
    const caller = appRouter.createCaller(createPublicContext());

    const detail = await caller.campaigns.getById({ id: 99 });
    const stats = await caller.campaigns.getPublicStats();

    expect(detail).toMatchObject({
      id: 99,
      title: "LEGENDARIO SOLIDARIO",
      status: "active",
    });
    expect(stats).toMatchObject({
      activeCampaigns: 1,
      raised: 0,
      contributorsCount: 0,
    });
  });

  it("não injetar necessidades padrão em campanhas de fallback sem itens", async () => {
    getDbMock.mockResolvedValue(null);
    whatsappServiceMock.getFallbackCampaigns.mockReturnValue([{
      id: 77,
      title: "Campanha sem itens",
      description: "Campanha criada para testar o estado vazio.",
      longDescription: "Campanha criada para testar o estado vazio.",
      category: "outro",
      goal: 250_000,
      raised: 0,
      status: "active" as const,
      imageUrl: null,
      createdBy: 1,
      createdAt: new Date("2026-07-28T00:00:00.000Z"),
      updatedAt: new Date("2026-07-28T00:00:00.000Z"),
    }]);

    const caller = appRouter.createCaller(createPublicContext());
    const detail = await caller.campaigns.getById({ id: 77 });

    expect(detail).not.toBeNull();
    expect(detail?.needs).toEqual([]);
  });

  it("não cria itens falsos para a campanha recanto quando ela ainda não tem necessidades", async () => {
    getDbMock.mockResolvedValue(null);
    whatsappServiceMock.getFallbackCampaigns.mockReturnValue([{
      id: 100001,
      title: "Construção Hotel Recanto de Paz",
      description: "Campanha criada para testar o estado vazio do recanto.",
      longDescription: "Campanha criada para testar o estado vazio do recanto.",
      category: "outro",
      goal: 150_000_000,
      raised: 0,
      status: "active" as const,
      imageUrl: "/obra-paredes.jpg",
      createdBy: 1,
      createdAt: new Date("2026-07-28T00:00:00.000Z"),
      updatedAt: new Date("2026-07-28T00:00:00.000Z"),
    }]);

    const caller = appRouter.createCaller(createPublicContext());
    const detail = await caller.campaigns.getById({ id: 100001 });

    expect(detail).not.toBeNull();
    expect(detail?.needs).toEqual([]);
  });

  it("usa o conteúdo canônico do recanto quando a campanha é acessada via localhost", async () => {
    getDbMock.mockResolvedValue(null);
    whatsappServiceMock.getFallbackCampaigns.mockReturnValue([{
      id: 100001,
      title: "Construção Hotel Recanto de Paz",
      description: "Campanha criada para testar o estado vazio do recanto.",
      longDescription: "Campanha criada para testar o estado vazio do recanto.",
      category: "outro",
      goal: 150_000_000,
      raised: 0,
      status: "active" as const,
      imageUrl: "/obra-paredes.jpg",
      createdBy: 1,
      createdAt: new Date("2026-07-28T00:00:00.000Z"),
      updatedAt: new Date("2026-07-28T00:00:00.000Z"),
    }]);

    const publicContext = createPublicContext();
    publicContext.req.headers = { host: "localhost:3004" };
    const caller = appRouter.createCaller(publicContext);
    const detail = await caller.campaigns.getById({ id: 100001 });

    expect(detail).not.toBeNull();
    expect(detail?.longDescription).toContain("A campanha apresenta uma obra real");
    expect(detail?.updates).toHaveLength(3);
    expect(detail?.galleryImages).toEqual(expect.arrayContaining([
      "/obra-paredes.jpg",
      "/obra-lavanderia.jpg",
      "/obra-drone.png",
      "/render-hotel.jpg",
    ]));
  });
});

describe("campaigns.getAll fallback", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    whatsappServiceMock.getFallbackCampaigns.mockReset();
    whatsappServiceMock.createFallbackCampaign.mockReset();
  });

  it("lista no admin apenas campanhas locais editaveis quando DB estiver indisponivel", async () => {
    getDbMock.mockResolvedValue(null);
    whatsappServiceMock.getFallbackCampaigns.mockReturnValue([
      {
        id: 100001,
        title: "Campanha Local",
        description: "Campanha criada localmente para operacao offline.",
        longDescription: "Campanha criada localmente para operacao offline com descricao completa.",
        category: "outro",
        goal: 200_000,
        raised: 25_000,
        status: "active" as const,
        imageUrl: "/obra-paredes.jpg",
        createdBy: 1,
        createdAt: new Date("2026-07-30T10:00:00.000Z"),
        updatedAt: new Date("2026-07-30T10:00:00.000Z"),
      },
    ]);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.campaigns.getAll();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 100001,
      title: "Campanha Local",
      initialRaised: 25_000,
      raised: 25_000,
    });
  });

  it("semeia uma campanha local inicial quando nao houver nenhuma no fallback", async () => {
    getDbMock.mockResolvedValue(null);
    whatsappServiceMock.getFallbackCampaigns.mockReturnValue([]);
    whatsappServiceMock.createFallbackCampaign.mockReturnValue({
      id: 100010,
      title: "Campanha Local Inicial",
      description: "Campanha criada automaticamente no modo local para permitir edicao e testes do painel admin.",
      longDescription: "Campanha criada automaticamente no modo local para permitir edicao e testes do painel admin quando o banco estiver indisponivel.",
      category: "outro",
      goal: 500_000,
      raised: 0,
      status: "active" as const,
      imageUrl: "/obra-paredes.jpg",
      createdBy: 1,
      createdAt: new Date("2026-07-30T10:05:00.000Z"),
      updatedAt: new Date("2026-07-30T10:05:00.000Z"),
    });

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.campaigns.getAll();

    expect(whatsappServiceMock.createFallbackCampaign).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 100010,
      title: "Campanha Local Inicial",
      goal: 500_000,
    });
  });
});

describe("campaigns comments", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("lista apenas comentários aprovados para a campanha pública", async () => {
    getDbMock.mockResolvedValue({
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: 2,
                campaignId: 10,
                userId: 7,
                authorName: "Apoiador",
                content: "Que obra linda!",
                status: "approved",
                createdAt: new Date("2026-01-02T00:00:00.000Z"),
                updatedAt: new Date("2026-01-02T00:00:00.000Z"),
              },
            ]),
          }),
        }),
      })),
    });
    const caller = appRouter.createCaller(createPublicContext());

    const result = await caller.campaigns.getComments({ campaignId: 10 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      campaignId: 10,
      content: "Que obra linda!",
      status: "approved",
    });
  });

  it("cria comentário com status pendente para usuários comuns", async () => {
    const values = vi.fn().mockResolvedValue({});
    getDbMock.mockResolvedValue({
      select: vi.fn(() => existingCampaignQuery()),
      insert: vi.fn(() => ({ values })),
    });
    const caller = appRouter.createCaller(createPublicContext());

    await caller.campaigns.createComment({
      campaignId: 10,
      content: "Vou apoiar essa obra com carinho.",
    });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 10,
      userId: undefined,
      content: "Vou apoiar essa obra com carinho.",
      status: "pending",
    }));
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
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })),
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
      targetQuantityExact: 20,
      unitValueCents: 4500,
      priority: "high",
    });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 10,
      name: "Cimento",
      priority: "high",
    }));
  });

  it("atualiza uma necessidade existente com os campos informados", async () => {
    const set = vi.fn().mockResolvedValue({});
    const where = vi.fn().mockResolvedValue({});
    set.mockReturnValue({ where });
    getDbMock.mockResolvedValue({
      update: vi.fn(() => ({ set })),
    });
    const caller = appRouter.createCaller(createAdminContext());

    await caller.campaigns.updateNeed({
      needId: 7,
      campaignId: 10,
      name: "Tijolo ecológico",
      quantity: "3.700 unidades",
      targetQuantityExact: 3700,
      unitValueCents: 180,
      priority: "high",
    });

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      name: "Tijolo ecológico",
      quantity: "3.700 unidades",
      targetQuantityExact: 3700,
      unitValueCents: 180,
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
      targetQuantityExact: 2,
      unitValueCents: 5000,
      priority: "medium",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(values).not.toHaveBeenCalled();
  });
});
