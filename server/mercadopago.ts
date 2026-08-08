import {
  MercadoPagoConfig,
  Payment,
  Preference,
  WebhookSignatureValidator,
} from "mercadopago";
import { ENV } from "./_core/env";

function getMercadoPagoConfig() {
  if (!ENV.mercadoPagoAccessToken) {
    throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado");
  }

  return new MercadoPagoConfig({
    accessToken: ENV.mercadoPagoAccessToken,
    options: { timeout: 10_000 },
  });
}

function normalizeBaseUrl(baseUrl: string) {
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("URL pública inválida para o checkout");
  }
  return parsed.origin;
}

export type CreatePreferenceInput = {
  campaignId: number;
  campaignTitle: string;
  amountCents: number;
  paymentMethod?: "pix" | "card" | "boleto";
  donorEmail: string;
  donorName?: string;
  externalReference: string;
  baseUrl: string;
};

export async function createMercadoPagoPreference(input: CreatePreferenceInput) {
  const origin = normalizeBaseUrl(input.baseUrl);
  const preferenceClient = new Preference(getMercadoPagoConfig());
  const response = await preferenceClient.create({
    body: {
      items: [
        {
          id: `campaign-${input.campaignId}`,
          title: `Contribuição para ${input.campaignTitle}`,
          quantity: 1,
          unit_price: input.amountCents / 100,
          currency_id: "BRL",
        },
      ],
      payer: {
        email: input.donorEmail,
        name: input.donorName,
      },
      external_reference: input.externalReference,
      metadata: {
        campaign_id: input.campaignId,
        contribution_reference: input.externalReference,
      },
      back_urls: {
        success: `${origin}/payment/success`,
        pending: `${origin}/payment/pending`,
        failure: `${origin}/payment/failure`,
      },
      auto_return: "approved",
      notification_url: `${origin}/api/webhooks/mercadopago`,
      payment_methods: input.paymentMethod === "pix"
        ? {
            default_payment_method_id: "pix",
            excluded_payment_types: [
              { id: "credit_card" },
              { id: "debit_card" },
              { id: "ticket" },
              { id: "atm" },
              { id: "prepaid_card" },
            ],
          }
        : undefined,
      // Keep descriptor short and plain to satisfy provider restrictions.
      statement_descriptor: "PARCERIABEM",
    },
    requestOptions: {
      idempotencyKey: input.externalReference,
    },
  });

  if (!response.id) {
    throw new Error("O Mercado Pago não retornou o identificador da preferência");
  }

  const isTestCredential = ENV.mercadoPagoAccessToken.startsWith("TEST-");
  const checkoutUrl = isTestCredential
    ? response.sandbox_init_point ?? response.init_point
    : response.init_point;

  if (!checkoutUrl) {
    throw new Error("O Mercado Pago não retornou uma URL de checkout");
  }

  return {
    id: response.id,
    checkoutUrl,
    environment: isTestCredential ? "test" : "production",
  } as const;
}

export async function getMercadoPagoPayment(paymentId: string) {
  const paymentClient = new Payment(getMercadoPagoConfig());
  return paymentClient.get({ id: paymentId });
}

export function validateMercadoPagoWebhook(input: {
  xSignature: string | string[] | undefined | null;
  xRequestId: string | string[] | undefined | null;
  dataId: string | string[] | undefined | null;
}) {
  // In environments without webhook secret, continue processing.
  // The payment is still verified directly against Mercado Pago API later.
  if (!ENV.mercadoPagoWebhookSecret) {
    return;
  }

  WebhookSignatureValidator.validate({
    ...input,
    secret: ENV.mercadoPagoWebhookSecret,
  });
}
