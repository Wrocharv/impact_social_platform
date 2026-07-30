import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const {
  getDbMock,
  createFallbackCashContributionMock,
  listFallbackPendingCashValidationsMock,
  listFallbackRecentCashValidationsMock,
  reviewFallbackCashContributionMock,
} = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  createFallbackCashContributionMock: vi.fn(),
  listFallbackPendingCashValidationsMock: vi.fn(),
  listFallbackRecentCashValidationsMock: vi.fn(),
  reviewFallbackCashContributionMock: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: getDbMock,
}));

vi.mock("./cashValidationFallback", () => ({
  createFallbackCashContribution: createFallbackCashContributionMock,
  listFallbackPendingCashValidations: listFallbackPendingCashValidationsMock,
  listFallbackRecentCashValidations: listFallbackRecentCashValidationsMock,
  reviewFallbackCashContribution: reviewFallbackCashContributionMock,
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
      quantity: "20 sacos",
    });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 7,
      donorEmail: "doa@example.org",
      type: "material",
      description: expect.stringContaining("Necessidade: Cimento"),
    }));
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining("Quantidade: 20 sacos"),
    }));
  });
});

describe("contributions.reviewCashContribution", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    createFallbackCashContributionMock.mockReset();
    listFallbackPendingCashValidationsMock.mockReset();
    listFallbackRecentCashValidationsMock.mockReset();
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
      .mockReturnValueOnce([])
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
      ]);
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

    expect(createFallbackCashContributionMock).toHaveBeenCalledOnce();
    expect(pending).toHaveLength(1);
    expect(recent).toEqual([]);
    expect(reviewed).toMatchObject({ success: true, status: "approved", contributionId: 700001 });
  });
});
