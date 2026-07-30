import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { getDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: getDbMock,
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

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit: where })) })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where })),
      })),
    };

    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller(createAdminContext());

    const result = await caller.contributions.reviewCashContribution({
      contributionId: 123,
      decision: "approve",
    });

    expect(result).toMatchObject({ success: true, status: "approved" });
    expect(db.update).toHaveBeenCalledTimes(1);
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
});
