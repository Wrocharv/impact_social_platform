import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const {
  getDbMock,
  createFallbackCashContributionMock,
  listFallbackCashContributionsMock,
  listFallbackPendingCashValidationsMock,
  listFallbackRecentCashValidationsMock,
  listFallbackMaterialContributionsMock,
  reviewFallbackCashContributionMock,
} = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  createFallbackCashContributionMock: vi.fn(),
  listFallbackCashContributionsMock: vi.fn(),
  listFallbackPendingCashValidationsMock: vi.fn(),
  listFallbackRecentCashValidationsMock: vi.fn(),
  listFallbackMaterialContributionsMock: vi.fn(),
  reviewFallbackCashContributionMock: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: getDbMock,
}));

vi.mock("./cashValidationFallback", () => ({
  createFallbackCashContribution: createFallbackCashContributionMock,
  listFallbackCashContributions: listFallbackCashContributionsMock,
  listFallbackPendingCashValidations: listFallbackPendingCashValidationsMock,
  listFallbackRecentCashValidations: listFallbackRecentCashValidationsMock,
  reviewFallbackCashContribution: reviewFallbackCashContributionMock,
}));

vi.mock("./materialValidationFallback", () => ({
  listFallbackMaterialContributions: listFallbackMaterialContributionsMock,
}));

import { appRouter } from "./routers";

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
      openId: "admin:1",
      name: "Admin",
      email: "gospeltv@gmail.com",
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      lastSignedIn: new Date(0),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("contributions fallback without database", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    listFallbackCashContributionsMock.mockReset();
    listFallbackCashContributionsMock.mockReturnValue([]);
    listFallbackMaterialContributionsMock.mockReset();
    listFallbackMaterialContributionsMock.mockReturnValue([]);
  });

  it("retorna null para lookup de doador quando o banco não está disponível", async () => {
    getDbMock.mockResolvedValue(null);
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.contributions.getDonorProfileLookup({
      donorWhatsapp: "11999990000",
      donorName: "Wellington",
      donorEmail: "wellington@example.com",
    })).resolves.toBeNull();
  });

  it("encontra perfil salvo no fallback local sem banco", async () => {
    getDbMock.mockResolvedValue(null);
    listFallbackCashContributionsMock.mockReturnValue([{ 
      id: 700010,
      campaignId: 100001,
      donorName: "Wellington Rocha",
      donorCpf: "12345678901",
      donorWhatsapp: "64999058919",
      donorEmail: "wellington@example.com",
      donorCity: "Rio Verde",
      donorChurch: "Igreja Central",
      allowPublicDisplay: true,
      amount: 10_000,
      status: "approved",
      paymentMethod: "cash",
      paymentStatusDetail: "cash_validated_in_person",
      validatedBy: 1,
      validatedAt: new Date("2026-08-07T12:00:00.000Z"),
      validationNote: null,
      validatorName: "Admin",
      validatorEmail: "admin@example.com",
      createdAt: new Date("2026-08-07T11:00:00.000Z"),
      updatedAt: new Date("2026-08-07T12:00:00.000Z"),
    }]);

    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.contributions.getDonorProfileLookup({ donorCpf: "123.456.789-01" })).resolves.toMatchObject({
      donorName: "Wellington Rocha",
      donorCpf: "12345678901",
      donorWhatsapp: "64999058919",
      donorCity: "Rio Verde",
      donorChurch: "Igreja Central",
      allowPublicDisplay: true,
    });
  });

  it("aceita contribuição financeira local mesmo sem banco disponível", async () => {
    getDbMock.mockResolvedValue(null);
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.contributions.createFinancialContribution({
      campaignId: 100001,
      amount: 100,
      donorName: "Wellington",
      donorWhatsapp: "11999990000",
      donorEmail: "wellington@example.com",
      donorCity: "Rio Verde",
      donorChurch: "Igreja",
      allowPublicDisplay: false,
    })).resolves.toMatchObject({ success: true });
  });

  it("lista aprovados do fallback local na comunidade quando não há banco", async () => {
    getDbMock.mockResolvedValue(null);
    listFallbackCashContributionsMock.mockReturnValue([{ 
      id: 700020,
      campaignId: 100001,
      donorName: "Wellington Rocha",
      donorCpf: "12345678901",
      donorWhatsapp: "64999058919",
      donorEmail: "wellington@example.com",
      donorCity: "Rio Verde",
      donorChurch: "Igreja Central",
      allowPublicDisplay: true,
      amount: 10_000,
      status: "approved",
      paymentMethod: "cash",
      paymentStatusDetail: "cash_validated_in_person",
      validatedBy: 1,
      validatedAt: new Date("2026-08-07T12:00:00.000Z"),
      validationNote: null,
      validatorName: "Admin",
      validatorEmail: "admin@example.com",
      createdAt: new Date("2026-08-07T11:00:00.000Z"),
      updatedAt: new Date("2026-08-07T12:00:00.000Z"),
    }]);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.contributions.getRegisteredDonors();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      donorName: "Wellington Rocha",
      donorCpf: "12345678901",
      totalAmountCents: 10_000,
      donationsCount: 1,
    });
  });
});

describe("contributions.createMaterialContribution", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("inclui a necessidade e a quantidade na descrição da oferta de material", async () => {
    const insertValues = vi.fn().mockResolvedValue({});
    const selectResults = [
      [{ id: 7 }],
      [{ id: 11, name: "Cimento" }],
    ];

    getDbMock.mockResolvedValue({
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockImplementation(async () => selectResults.shift() ?? []),
          }),
        }),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
    });

    const caller = appRouter.createCaller(createPublicContext());

    await caller.contributions.createMaterialContribution({
      campaignId: 7,
      description: "Quero doar cimento para a obra.",
      donorEmail: "doa@example.org",
      campaignNeedId: 11,
      quantityExact: 20,
    });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 7,
      donorEmail: "doa@example.org",
      type: "material",
      description: expect.stringContaining("Necessidade: Cimento"),
    }));
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining("Quantidade: 20"),
    }));
  });

  it("permite nova oferta do mesmo doador quando ainda há saldo", async () => {
    const insertValues = vi.fn().mockResolvedValue({});
    const selectResults = [
      [{ id: 7 }],
      [{ id: 11, name: "Cimento", targetQuantityExact: null, unitValueCents: null }],
      [{ id: 999, donorEmail: "doa@example.org", donorWhatsapp: "11999990000" }],
    ];

    getDbMock.mockResolvedValue({
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockImplementation(async () => selectResults.shift() ?? []),
          }),
        }),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
    });

    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.contributions.createMaterialContribution({
      campaignId: 7,
      description: "Quero doar cimento para a obra.",
      donorEmail: "doa@example.org",
      donorWhatsapp: "11999990000",
      campaignNeedId: 11,
      quantityExact: 20,
    })).resolves.toMatchObject({ success: true });

    expect(insertValues).toHaveBeenCalledTimes(1);
  });

  it("permite oferta com WhatsApp em máscara diferente quando há saldo", async () => {
    const insertValues = vi.fn().mockResolvedValue({});
    const selectResults = [
      [{ id: 7 }],
      [{ id: 11, name: "Cimento", targetQuantityExact: null, unitValueCents: null }],
      [{ id: 555, donorEmail: null, donorWhatsapp: "11 99999-0000" }],
    ];

    getDbMock.mockResolvedValue({
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockImplementation(async () => selectResults.shift() ?? []),
          }),
        }),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
    });

    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.contributions.createMaterialContribution({
      campaignId: 7,
      description: "Quero doar cimento para a obra.",
      donorWhatsapp: "(11) 99999-0000",
      campaignNeedId: 11,
      quantityExact: 20,
    })).resolves.toMatchObject({ success: true });

    expect(insertValues).toHaveBeenCalledTimes(1);
  });
});

describe("contributions.reviewCashContribution", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    createFallbackCashContributionMock.mockReset();
    listFallbackCashContributionsMock.mockReset();
    listFallbackPendingCashValidationsMock.mockReset();
    listFallbackRecentCashValidationsMock.mockReset();
    listFallbackMaterialContributionsMock.mockReset();
    reviewFallbackCashContributionMock.mockReset();
  });

  it("aprova contribuição em dinheiro pendente de validação presencial", async () => {
    const where = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 123,
          type: "financial",
          status: "pending",
          paymentMethod: "cash",
          paymentStatusDetail: "awaiting_cash_confirmation",
        },
      ])
      .mockResolvedValueOnce({});
    const set = vi.fn(() => ({ where }));

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit: where })) })),
      })),
      update: vi.fn(() => ({
        set,
      })),
    };

    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller(createAdminContext());

    const result = await caller.contributions.reviewCashContribution({
      contributionId: 123,
      decision: "approve",
      validationNote: "  Caixa recebido na igreja  ",
    });

    expect(result).toMatchObject({ success: true, status: "approved" });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      status: "approved",
      paymentStatusDetail: "cash_validated_in_person",
      validatedBy: 1,
      validationNote: "Caixa recebido na igreja",
    }));
  });

  it("registra trilha de auditoria ao rejeitar validação presencial", async () => {
    const where = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 200,
          type: "financial",
          status: "pending",
          paymentMethod: "cash",
          paymentStatusDetail: "awaiting_cash_confirmation",
        },
      ])
      .mockResolvedValueOnce({});
    const set = vi.fn(() => ({ where }));

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit: where })) })),
      })),
      update: vi.fn(() => ({
        set,
      })),
    };

    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller(createAdminContext());

    const result = await caller.contributions.reviewCashContribution({
      contributionId: 200,
      decision: "reject",
      validationNote: "Não houve confirmação do recebedor.",
    });

    expect(result).toMatchObject({ success: true, status: "rejected", contributionId: 200 });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      status: "rejected",
      paymentStatusDetail: "cash_validation_rejected",
      validatedBy: 1,
      validationNote: "Não houve confirmação do recebedor.",
    }));
  });

  it("rejeita quando contribuição não está aguardando validação presencial", async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValueOnce([
              {
                id: 124,
                type: "financial",
                status: "approved",
                paymentMethod: "cash",
                paymentStatusDetail: "cash_validated_in_person",
              },
            ]),
          })),
        })),
      })),
      update: vi.fn(),
    };

    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller(createAdminContext());

    await expect(
      caller.contributions.reviewCashContribution({ contributionId: 124, decision: "reject" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("usa fallback local para listar e revisar validacao presencial sem DB", async () => {
    getDbMock.mockResolvedValue(null);
    listFallbackPendingCashValidationsMock
      .mockReturnValueOnce([
        {
          id: 700001,
          campaignId: 100000,
          donorName: "Doador Local",
          donorWhatsapp: "(11) 99999-0000",
          donorCity: "Sao Paulo",
          amount: 25_000,
          createdAt: new Date("2026-07-30T12:00:00.000Z"),
          paymentStatusDetail: "awaiting_cash_confirmation",
        },
      ])
      .mockReturnValueOnce([]);
    listFallbackRecentCashValidationsMock.mockReturnValue([]);
    reviewFallbackCashContributionMock.mockReturnValue({
      ok: true,
      status: "approved",
      contributionId: 700001,
    });

    const caller = appRouter.createCaller(createAdminContext());

    const pending = await caller.contributions.getPendingCashValidations();
    const recent = await caller.contributions.getRecentCashValidations({ limit: 20 });
    const reviewed = await caller.contributions.reviewCashContribution({
      contributionId: 700001,
      decision: "approve",
      validationNote: "Confirmado local",
    });

    expect(pending).toHaveLength(1);
    expect(recent).toEqual([]);
    expect(reviewed).toMatchObject({ success: true, status: "approved", contributionId: 700001 });
  });
});
