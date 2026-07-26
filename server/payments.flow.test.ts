import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { getDbMock, createPreferenceMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  createPreferenceMock: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./mercadopago", () => ({
  createMercadoPagoPreference: createPreferenceMock,
}));

import { appRouter } from "./routers";

function createDb(campaignRows: unknown[]) {
  const limit = vi
    .fn()
    .mockResolvedValueOnce(campaignRows)
    .mockResolvedValueOnce([{ id: 91 }]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const values = vi.fn().mockResolvedValue({});
  const insert = vi.fn(() => ({ values }));
  const updateWhere = vi.fn().mockResolvedValue({});
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));

  return { db: { select, insert, update }, values, set };
}

function createContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      get: (name: string) => {
        if (name === "host") return "parceiros.example";
        if (name === "x-forwarded-proto") return "https";
        return undefined;
      },
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("payments.createPaymentPreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cria uma única contribuição pendente e associa a preferência", async () => {
    const { db, values, set } = createDb([
      { id: 7, title: "Casa da Viúva", status: "active" },
    ]);
    getDbMock.mockResolvedValue(db);
    createPreferenceMock.mockResolvedValue({
      id: "pref-123",
      checkoutUrl: "https://sandbox.mercadopago.com/checkout/v1/redirect",
      environment: "test",
    });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.payments.createPaymentPreference({
      campaignId: 7,
      amount: 5_000,
      donorEmail: "doador@example.com",
      donorName: "Maria",
    });

    expect(values).toHaveBeenCalledTimes(1);
    const inserted = values.mock.calls[0]?.[0];
    expect(inserted).toMatchObject({
      campaignId: 7,
      type: "financial",
      amount: 5_000,
      status: "pending",
      paymentStatusDetail: "preference_creating",
    });
    expect(inserted.externalReference).toMatch(/^pdb-7-/);
    expect(createPreferenceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 7,
        amountCents: 5_000,
        externalReference: inserted.externalReference,
        baseUrl: "https://parceiros.example",
      }),
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ preferenceId: "pref-123", paymentStatusDetail: "preference_created" }),
    );
    expect(result).toMatchObject({ contributionId: 91, preferenceId: "pref-123", environment: "test" });
  });

  it("recusa checkout para campanha inexistente ou inativa", async () => {
    const { db, values } = createDb([]);
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.payments.createPaymentPreference({
        campaignId: 99,
        amount: 1_000,
        donorEmail: "doador@example.com",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(values).not.toHaveBeenCalled();
    expect(createPreferenceMock).not.toHaveBeenCalled();
  });
});

describe("contributions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persiste oferta de material como pendente de triagem", async () => {
    const { db, values } = createDb([{ id: 7 }]);
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller(createContext());

    const result = await caller.contributions.createMaterialContribution({
      campaignId: 7,
      description: "Cinquenta sacos de cimento disponíveis para retirada.",
      donorName: "João",
      donorEmail: "joao@example.com",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 7,
        type: "material",
        status: "pending",
        paymentStatusDetail: "awaiting_triage",
      }),
    );
    expect(result.success).toBe(true);
  });
});
