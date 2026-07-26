import { createHmac } from "node:crypto";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock, getPaymentMock, validateWebhookMock, sendNotificationMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  getPaymentMock: vi.fn(),
  validateWebhookMock: vi.fn(),
  sendNotificationMock: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./mercadopago", () => ({
  getMercadoPagoPayment: getPaymentMock,
  validateMercadoPagoWebhook: validateWebhookMock,
}));
vi.mock("./notificationDeliveries", () => ({
  sendContributionApprovedNotification: sendNotificationMock,
}));

import {
  amountToCents,
  buildWebhookEventKey,
  handleMercadoPagoWebhook,
  mapMercadoPagoStatus,
} from "./paymentWebhook";
import { ENV } from "./_core/env";

function createResponse() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { res: { status } as unknown as Response, status, json };
}

function createRequest(overrides: Partial<Request> = {}) {
  const headers: Record<string, string> = {
    "x-request-id": "req-1",
    "x-signature": "ts=1,v1=signature",
  };
  return {
    query: { "data.id": "pay-1", type: "payment" },
    body: { id: "notification-1", action: "payment.updated", data: { id: "pay-1" } },
    header: (name: string) => headers[name.toLowerCase()],
    ...overrides,
  } as unknown as Request;
}

function createWebhookDb(existingEvent: unknown[] = []) {
  const limit = vi
    .fn()
    .mockResolvedValueOnce(existingEvent)
    .mockResolvedValueOnce([
      {
        id: 20,
        campaignId: 7,
        type: "financial",
        amount: 5_000,
        currency: "BRL",
        externalReference: "pdb-7-ref",
        donorEmail: "doador@example.com",
        donorName: "Maria",
      },
    ])
    .mockResolvedValueOnce([{ title: "Casa da Viúva" }]);
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

describe("funções de pagamento", () => {
  it.each([
    ["approved", "approved"],
    ["pending", "pending"],
    ["rejected", "rejected"],
    ["cancelled", "cancelled"],
    ["refunded", "refunded"],
    ["charged_back", "refunded"],
  ])("mapeia %s para %s", (source, target) => {
    expect(mapMercadoPagoStatus(source)).toBe(target);
  });

  it("converte valores monetários para centavos e cria chave estável", () => {
    expect(amountToCents(50.01)).toBe(5_001);
    expect(buildWebhookEventKey({ paymentId: "p1", payloadHash: "h", notificationId: "n1" }))
      .toBe("mercado_pago:n1");
  });

  it("aceita assinatura HMAC válida e rejeita assinatura inválida", async () => {
    const { validateMercadoPagoWebhook: validateRealWebhook } = await vi.importActual<
      typeof import("./mercadopago")
    >("./mercadopago");
    expect(ENV.mercadoPagoWebhookSecret).toBeTruthy();
    const dataId = "123";
    const requestId = "request-123";
    const ts = Math.floor(Date.now() / 1000);
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const digest = createHmac("sha256", ENV.mercadoPagoWebhookSecret)
      .update(manifest)
      .digest("hex");

    expect(() => validateRealWebhook({
      dataId,
      xRequestId: requestId,
      xSignature: `ts=${ts},v1=${digest}`,
    })).not.toThrow();
    expect(() => validateRealWebhook({
      dataId,
      xRequestId: requestId,
      xSignature: `ts=${ts},v1=invalid`,
    })).toThrow();
  });
});

describe("Webhook do Mercado Pago", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendNotificationMock.mockResolvedValue({ status: "sent", providerMessageId: "email-1" });
  });

  it("consulta o pagamento e atualiza a contribuição aprovada", async () => {
    const { db, values, set } = createWebhookDb();
    getDbMock.mockResolvedValue(db);
    getPaymentMock.mockResolvedValue({
      id: "pay-1",
      external_reference: "pdb-7-ref",
      transaction_amount: 50,
      currency_id: "BRL",
      status: "approved",
      status_detail: "accredited",
      payment_type_id: "bank_transfer",
      payment_method_id: "pix",
      date_approved: "2026-07-25T12:00:00.000Z",
    });
    const { res, status } = createResponse();

    await handleMercadoPagoWebhook(createRequest(), res);

    expect(validateWebhookMock).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ status: "processing", paymentId: "pay-1" }));
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        paymentId: "pay-1",
        paymentStatusDetail: "accredited",
        paymentMethod: "bank_transfer:pix",
      }),
    );
    expect(sendNotificationMock).toHaveBeenCalledWith({
      contributionId: 20,
      donorEmail: "doador@example.com",
      donorName: "Maria",
      campaignTitle: "Casa da Viúva",
      amountCents: 5_000,
      reference: "pdb-7-ref",
    });
    expect(status).toHaveBeenCalledWith(200);
  });

  it("preserva o pagamento aprovado se a notificação falhar", async () => {
    const { db } = createWebhookDb();
    getDbMock.mockResolvedValue(db);
    getPaymentMock.mockResolvedValue({
      id: "pay-1",
      external_reference: "pdb-7-ref",
      transaction_amount: 50,
      currency_id: "BRL",
      status: "approved",
      status_detail: "accredited",
    });
    sendNotificationMock.mockRejectedValueOnce(new Error("provider unavailable"));
    const { res, status } = createResponse();

    await handleMercadoPagoWebhook(createRequest(), res);

    expect(status).toHaveBeenCalledWith(200);
  });

  it("trata evento já concluído como duplicado", async () => {
    const { db } = createWebhookDb([{ id: 1, status: "completed" }]);
    getDbMock.mockResolvedValue(db);
    const { res, status, json } = createResponse();

    await handleMercadoPagoWebhook(createRequest(), res);

    expect(getPaymentMock).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ received: true, duplicate: true });
  });

  it("rejeita assinatura inválida antes de acessar o banco", async () => {
    validateWebhookMock.mockImplementationOnce(() => {
      throw new Error("invalid");
    });
    const { res, status } = createResponse();

    await handleMercadoPagoWebhook(createRequest(), res);

    expect(getDbMock).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });
});
