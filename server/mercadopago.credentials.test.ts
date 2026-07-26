import { describe, expect, it } from "vitest";

describe("Mercado Pago credentials", () => {
  it("autentica no endpoint de usuário e possui segredo de webhook configurado", async () => {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

    expect(accessToken, "MERCADO_PAGO_ACCESS_TOKEN ausente").toBeTruthy();
    expect(webhookSecret, "MERCADO_PAGO_WEBHOOK_SECRET ausente").toBeTruthy();

    const response = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.status).toBe(200);
    const account = (await response.json()) as { id?: number };
    expect(account.id).toBeTypeOf("number");
  }, 15_000);
});
