import { beforeEach, describe, expect, it, vi } from "vitest";

const { preferenceCreateMock } = vi.hoisted(() => ({
  preferenceCreateMock: vi.fn(),
}));

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {},
  Preference: class {
    create = preferenceCreateMock;
  },
  Payment: class {},
  WebhookSignatureValidator: { validate: vi.fn() },
}));

vi.mock("./_core/env", () => ({
  ENV: {
    mercadoPagoAccessToken: "TEST-token",
    mercadoPagoWebhookSecret: "secret",
  },
}));

import { createMercadoPagoPreference } from "./mercadopago";

describe("createMercadoPagoPreference", () => {
  beforeEach(() => {
    preferenceCreateMock.mockReset();
    preferenceCreateMock.mockResolvedValue({
      id: "preference-1",
      sandbox_init_point: "https://sandbox.mercadopago.com/checkout",
    });
  });

  it("oferece somente PIX quando o doador escolhe PIX", async () => {
    await createMercadoPagoPreference({
      campaignId: 100001,
      campaignTitle: "Campanha",
      amountCents: 5_000,
      paymentMethod: "pix",
      donorEmail: "doador@example.com",
      externalReference: "pdb-100001-ref",
      baseUrl: "https://www.parceriadobem.com.br",
    });

    expect(preferenceCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        payment_methods: {
          default_payment_method_id: "pix",
          excluded_payment_types: [
            { id: "credit_card" },
            { id: "debit_card" },
            { id: "ticket" },
            { id: "atm" },
            { id: "prepaid_card" },
          ],
        },
      }),
    }));
  });
});