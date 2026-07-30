import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { getDbMock, createPreferenceMock, createFallbackCashContributionMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  createPreferenceMock: vi.fn(),
  createFallbackCashContributionMock: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./mercadopago", () => ({
  createMercadoPagoPreference: createPreferenceMock,
}));

vi.mock("./cashValidationFallback", () => ({
  createFallbackCashContribution: createFallbackCashContributionMock,
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
  const originalEnablePixOperationalFallback = process.env.ENABLE_PIX_OPERATIONAL_FALLBACK;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_PIX_OPERATIONAL_FALLBACK = originalEnablePixOperationalFallback;
    createFallbackCashContributionMock.mockReturnValue({ id: 700111 });
  });

  afterAll(() => {
    process.env.ENABLE_PIX_OPERATIONAL_FALLBACK = originalEnablePixOperationalFallback;
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
      donorWhatsapp: "11999999999",
      donorCity: "São Paulo",
      allowPublicDisplay: false,
      paymentMethod: "pix",
    });

    expect(values).toHaveBeenCalledTimes(1);
    const inserted = values.mock.calls[0]?.[0];
    expect(inserted).toMatchObject({
      campaignId: 7,
      type: "financial",
      amount: 5_000,
      status: "pending",
      paymentStatusDetail: "preference_creating",
      paymentMethod: "pix",
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

  it("aceita checkout legado sem dados extras do doador", async () => {
    const { db, values, set } = createDb([
      { id: 7, title: "Casa da Viúva", status: "active" },
    ]);
    getDbMock.mockResolvedValue(db);
    createPreferenceMock.mockResolvedValue({
      id: "pref-456",
      checkoutUrl: "https://sandbox.mercadopago.com/checkout/v1/redirect",
      environment: "test",
    });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.payments.createPaymentPreference({
      campaignId: 7,
      amount: 5_000,
      donorEmail: "doador@example.com",
      donorName: "",
    });

    expect(values).toHaveBeenCalledTimes(1);
    const inserted = values.mock.calls[0]?.[0];
    expect(inserted).toMatchObject({
      donorName: "",
      donorWhatsapp: "",
      donorCity: "",
      allowPublicDisplay: false,
    });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ preferenceId: "pref-456", paymentStatusDetail: "preference_created" }),
    );
    expect(result).toMatchObject({ preferenceId: "pref-456", environment: "test" });
  });

  it("registra doacao em dinheiro sem chamar Mercado Pago", async () => {
    const { db, values } = createDb([
      { id: 7, title: "Casa da Viúva", status: "active" },
    ]);
    getDbMock.mockResolvedValue(db);

    const caller = appRouter.createCaller(createContext());
    const result = await caller.payments.createPaymentPreference({
      campaignId: 7,
      amount: 5_000,
      donorEmail: "doador@example.com",
      donorName: "Maria",
      donorWhatsapp: "11999999999",
      donorCity: "São Paulo",
      allowPublicDisplay: false,
      paymentMethod: "cash",
    });

    expect(values).toHaveBeenCalledTimes(1);
    const inserted = values.mock.calls[0]?.[0];
    expect(inserted).toMatchObject({
      campaignId: 7,
      type: "financial",
      amount: 5_000,
      status: "pending",
      paymentMethod: "cash",
      paymentStatusDetail: "awaiting_cash_confirmation",
    });
    expect(createPreferenceMock).not.toHaveBeenCalled();
    expect(result.preferenceId).toBe("cash-manual");
    expect(result.checkoutUrl).toContain("/contribute/confirmation");
    expect(result.checkoutUrl).toContain("paymentMethod=cash");
    expect(result.checkoutUrl).toContain("paymentStatus=awaiting_validation");
    expect(result.checkoutUrl).toContain("campaignId=7");
  });

  it("falha quando doacao em dinheiro nao puder ser persistida para validacao", async () => {
    const { db, values } = createDb([
      { id: 7, title: "Casa da Viúva", status: "active" },
    ]);
    values
      .mockRejectedValueOnce(new Error("ER_BAD_FIELD_ERROR: Unknown column 'paymentStatusDetail'"))
      .mockRejectedValueOnce(new Error("ER_BAD_FIELD_ERROR: Unknown column 'paymentMethod'"))
      .mockRejectedValueOnce(new Error("ER_BAD_FIELD_ERROR: Unknown column 'status'"));
    getDbMock.mockResolvedValue(db);

    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.payments.createPaymentPreference({
        campaignId: 7,
        amount: 5_000,
        donorEmail: "doador@example.com",
        donorName: "Maria",
        donorWhatsapp: "11999999999",
        donorCity: "São Paulo",
        allowPublicDisplay: false,
        paymentMethod: "cash",
      }),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "Não foi possível registrar a doação em dinheiro para validação presencial. Tente novamente em instantes.",
    });

    expect(createPreferenceMock).not.toHaveBeenCalled();
  });

  it("usa persistencia legada quando coluna nova do cash estiver ausente", async () => {
    const { db, values } = createDb([
      { id: 7, title: "Casa da Viúva", status: "active" },
    ]);
    values.mockRejectedValueOnce(new Error("ER_BAD_FIELD_ERROR: Unknown column 'paymentStatusDetail'"));
    getDbMock.mockResolvedValue(db);

    const caller = appRouter.createCaller(createContext());
    const result = await caller.payments.createPaymentPreference({
      campaignId: 7,
      amount: 5_000,
      donorEmail: "doador@example.com",
      donorName: "Maria",
      donorWhatsapp: "11999999999",
      donorCity: "São Paulo",
      allowPublicDisplay: false,
      paymentMethod: "cash",
    });

    expect(values).toHaveBeenCalledTimes(2);
    expect(createPreferenceMock).not.toHaveBeenCalled();
    expect(result.preferenceId).toBe("cash-manual");
    expect(result.checkoutUrl).toContain("paymentMethod=cash");
  });

  it("propaga mensagem útil quando o Mercado Pago não está configurado", async () => {
    const { db, values } = createDb([
      { id: 7, title: "Casa da Viúva", status: "active" },
    ]);
    getDbMock.mockResolvedValue(db);
    createPreferenceMock.mockRejectedValueOnce(new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado"));

    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.payments.createPaymentPreference({
        campaignId: 7,
        amount: 5_000,
        donorEmail: "doador@example.com",
        donorName: "Maria",
        donorWhatsapp: "11999999999",
        donorCity: "São Paulo",
        allowPublicDisplay: false,
        paymentMethod: "pix",
      }),
    ).rejects.toMatchObject({ code: "BAD_GATEWAY", message: "MERCADO_PAGO_ACCESS_TOKEN não configurado" });
    expect(values).toHaveBeenCalledTimes(1);
  });

  it("segue para checkout mesmo quando salvar contribuicao falha por schema desatualizado", async () => {
    const { db, values, set } = createDb([
      { id: 7, title: "Casa da Viúva", status: "active" },
    ]);
    values.mockRejectedValueOnce(new Error("ER_BAD_FIELD_ERROR: Unknown column 'paymentMethod'"));
    getDbMock.mockResolvedValue(db);
    createPreferenceMock.mockResolvedValue({
      id: "pref-schema-fallback",
      checkoutUrl: "https://sandbox.mercadopago.com/checkout/v1/redirect",
      environment: "test",
    });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.payments.createPaymentPreference({
      campaignId: 7,
      amount: 5_000,
      donorEmail: "doador@example.com",
      donorName: "Maria",
      donorWhatsapp: "11999999999",
      donorCity: "São Paulo",
      allowPublicDisplay: false,
      paymentMethod: "pix",
    });

    expect(values).toHaveBeenCalledTimes(1);
    expect(createPreferenceMock).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      preferenceId: "pref-schema-fallback",
      checkoutUrl: "https://sandbox.mercadopago.com/checkout/v1/redirect",
      contributionId: undefined,
      environment: "test",
    });
  });

  it("aplica fallback operacional quando PIX falha por credencial sem permissao", async () => {
    process.env.ENABLE_PIX_OPERATIONAL_FALLBACK = "true";

    const { db, values, set } = createDb([
      { id: 7, title: "Casa da Viúva", status: "active" },
    ]);
    getDbMock.mockResolvedValue(db);
    createPreferenceMock.mockRejectedValueOnce(
      new Error("Credencial do Mercado Pago invalida ou sem permissao para criar PIX."),
    );

    const caller = appRouter.createCaller(createContext());
    const result = await caller.payments.createPaymentPreference({
      campaignId: 7,
      amount: 5_000,
      donorEmail: "doador@example.com",
      donorName: "Maria",
      donorWhatsapp: "11999999999",
      donorCity: "São Paulo",
      allowPublicDisplay: false,
      paymentMethod: "pix",
    });

    expect(values).toHaveBeenCalledTimes(1);
    expect(createPreferenceMock).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
    expect(result.preferenceId).toBe("pix-credential-fallback");
    expect(result.checkoutUrl).toContain("/payment/pending");
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
        donorName: "Maria",
        donorWhatsapp: "11999999999",
        donorCity: "São Paulo",
        allowPublicDisplay: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(values).not.toHaveBeenCalled();
    expect(createPreferenceMock).not.toHaveBeenCalled();
  });

  it("persiste doacao em dinheiro no fallback local quando DB estiver indisponivel", async () => {
    getDbMock.mockResolvedValue(null);
    const caller = appRouter.createCaller(createContext());

    const result = await caller.payments.createPaymentPreference({
      campaignId: 7,
      amount: 5_000,
      donorEmail: "doador@example.com",
      donorName: "Maria",
      donorWhatsapp: "11999999999",
      donorCity: "Sao Paulo",
      allowPublicDisplay: false,
      paymentMethod: "cash",
    });

    expect(createFallbackCashContributionMock).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 7,
      amount: 5_000,
      donorName: "Maria",
    }));
    expect(result.contributionId).toBe(700111);
    expect(result.preferenceId).toBe("cash-manual");
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
      donorWhatsapp: "11999999999",
      donorCity: "São Paulo",
      allowPublicDisplay: false,
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
