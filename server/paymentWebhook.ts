import type { Express, Request, Response } from "express";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { campaigns, contributions, paymentWebhookEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { getMercadoPagoPayment, validateMercadoPagoWebhook } from "./mercadopago";
import { sendContributionApprovedNotification } from "./notificationDeliveries";

type ContributionStatus =
  | "pending"
  | "approved"
  | "completed"
  | "rejected"
  | "cancelled"
  | "refunded";

function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstString(value[0]);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

export function mapMercadoPagoStatus(status?: string): ContributionStatus {
  switch (status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return "pending";
  }
}

export function amountToCents(amount?: number) {
  if (amount === undefined || !Number.isFinite(amount)) return undefined;
  return Math.round(amount * 100);
}

export function buildWebhookEventKey(input: {
  notificationId?: string;
  requestId?: string;
  action?: string;
  paymentId: string;
  payloadHash: string;
}) {
  return [
    "mercado_pago",
    input.notificationId || input.requestId || `${input.action || "payment"}:${input.paymentId}:${input.payloadHash}`,
  ].join(":");
}

export async function handleMercadoPagoWebhook(req: Request, res: Response) {
  const dataId = firstString(req.query["data.id"]) || firstString(req.body?.data?.id);
  const requestId = firstString(req.header("x-request-id"));
  const xSignature = req.header("x-signature");

  if (!dataId) {
    return res.status(400).json({ received: false, error: "missing_data_id" });
  }

  try {
    validateMercadoPagoWebhook({ xSignature, xRequestId: requestId, dataId });
  } catch (error) {
    console.warn("[MercadoPago] Assinatura de Webhook inválida", {
      requestId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return res.status(401).json({ received: false, error: "invalid_signature" });
  }

  const type = firstString(req.query.type) || firstString(req.body?.type);
  const action = firstString(req.body?.action) || type;
  if (type && type !== "payment" && !action?.startsWith("payment")) {
    return res.status(200).json({ received: true, ignored: true });
  }

  const db = await getDb();
  if (!db) {
    return res.status(503).json({ received: false, error: "database_unavailable" });
  }

  const payloadHash = createHash("sha256")
    .update(JSON.stringify(req.body ?? {}))
    .digest("hex");
  const eventKey = buildWebhookEventKey({
    notificationId: firstString(req.body?.id),
    requestId,
    action,
    paymentId: dataId,
    payloadHash,
  });

  const [existingEvent] = await db
    .select()
    .from(paymentWebhookEvents)
    .where(eq(paymentWebhookEvents.eventKey, eventKey))
    .limit(1);

  if (existingEvent?.status === "completed" || existingEvent?.status === "processing") {
    return res.status(200).json({ received: true, duplicate: true });
  }

  if (existingEvent) {
    await db
      .update(paymentWebhookEvents)
      .set({ status: "processing", errorMessage: null, updatedAt: new Date() })
      .where(eq(paymentWebhookEvents.id, existingEvent.id));
  } else {
    try {
      await db.insert(paymentWebhookEvents).values({
        eventKey,
        requestId,
        paymentId: dataId,
        action,
        payloadHash,
        status: "processing",
      });
    } catch {
      return res.status(200).json({ received: true, duplicate: true });
    }
  }

  try {
    const payment = await getMercadoPagoPayment(dataId);
    const externalReference = payment.external_reference;
    if (!externalReference || String(payment.id) !== dataId) {
      throw new Error("Pagamento sem referência externa válida");
    }

    const [contribution] = await db
      .select()
      .from(contributions)
      .where(eq(contributions.externalReference, externalReference))
      .limit(1);

    if (!contribution || contribution.type !== "financial" || contribution.amount === null) {
      throw new Error("Contribuição financeira não encontrada");
    }

    const paidAmount = amountToCents(payment.transaction_amount);
    if (paidAmount !== contribution.amount || payment.currency_id !== contribution.currency) {
      throw new Error("Valor ou moeda do pagamento não corresponde à contribuição");
    }

    const status = mapMercadoPagoStatus(payment.status);
    const paidAt = status === "approved" && payment.date_approved
      ? new Date(payment.date_approved)
      : null;
    const paymentMethod = [payment.payment_type_id, payment.payment_method_id]
      .filter(Boolean)
      .join(":") || null;

    await db
      .update(contributions)
      .set({
        status,
        paymentId: String(payment.id),
        paymentStatusDetail: payment.status_detail || payment.status || null,
        paymentMethod,
        paidAt,
        updatedAt: new Date(),
      })
      .where(eq(contributions.id, contribution.id));

    await db
      .update(paymentWebhookEvents)
      .set({ status: "completed", processedAt: new Date(), updatedAt: new Date() })
      .where(eq(paymentWebhookEvents.eventKey, eventKey));

    if (status === "approved") {
      try {
        const [campaign] = await db
          .select({ title: campaigns.title })
          .from(campaigns)
          .where(eq(campaigns.id, contribution.campaignId))
          .limit(1);

        await sendContributionApprovedNotification({
          contributionId: contribution.id,
          donorEmail: contribution.donorEmail,
          donorName: contribution.donorName,
          campaignTitle: campaign?.title || `Campanha #${contribution.campaignId}`,
          amountCents: contribution.amount,
          reference: externalReference,
        });
      } catch (notificationError) {
        console.error("[Email] A confirmação financeira foi preservada, mas a notificação falhou", {
          contributionId: contribution.id,
          message: notificationError instanceof Error ? notificationError.message : "unknown",
        });
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[MercadoPago] Falha ao processar Webhook", { requestId, dataId, message });
    await db
      .update(paymentWebhookEvents)
      .set({ status: "failed", errorMessage: message.slice(0, 1000), updatedAt: new Date() })
      .where(eq(paymentWebhookEvents.eventKey, eventKey));
    return res.status(500).json({ received: false, error: "processing_failed" });
  }
}

export function registerMercadoPagoWebhook(app: Express) {
  app.post("/api/webhooks/mercadopago", handleMercadoPagoWebhook);
}
