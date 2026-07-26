import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { notificationDeliveries } from "../drizzle/schema";
import { getDb } from "./db";
import {
  buildContributionApprovedEmail,
  sendTransactionalEmail,
  type EmailSender,
} from "./email";

type DeliveryStatus = "processing" | "sent" | "failed" | "skipped";

type DeliveryRecord = {
  id: number;
  status: DeliveryStatus;
  attemptCount: number;
};

export interface NotificationDeliveryRepository {
  findByKey(idempotencyKey: string): Promise<DeliveryRecord | undefined>;
  createProcessing(input: {
    notificationType: string;
    resourceType: string;
    resourceId: number;
    recipientEmail: string;
    idempotencyKey: string;
    processingToken: string;
  }): Promise<boolean>;
  claimFailed(id: number, processingToken: string): Promise<boolean>;
  markSent(input: {
    id: number;
    processingToken: string;
    providerMessageId: string;
  }): Promise<void>;
  markFailed(input: {
    id: number;
    processingToken: string;
    error: string;
  }): Promise<void>;
}

type ContributionApprovedNotificationInput = {
  contributionId: number;
  donorEmail?: string | null;
  donorName?: string | null;
  campaignTitle: string;
  amountCents: number;
  reference: string;
};

type NotificationDependencies = {
  repository?: NotificationDeliveryRepository;
  sender?: EmailSender;
};

function isDuplicateKeyError(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "ER_DUP_ENTRY" || message.toLowerCase().includes("duplicate");
}

function affectedRows(result: unknown) {
  const value = Array.isArray(result) ? result[0] : result;
  const count = (value as { affectedRows?: unknown } | null)?.affectedRows;
  return typeof count === "number" ? count : 1;
}

export function buildContributionNotificationKey(
  contributionId: number,
  recipientEmail: string,
) {
  return `contribution-approved:${contributionId}:${recipientEmail.trim().toLowerCase()}`;
}

export async function createNotificationDeliveryRepository(): Promise<NotificationDeliveryRepository> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para registrar a notificação");

  return {
    async findByKey(idempotencyKey) {
      const [row] = await db
        .select({
          id: notificationDeliveries.id,
          status: notificationDeliveries.status,
          attemptCount: notificationDeliveries.attemptCount,
        })
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.idempotencyKey, idempotencyKey))
        .limit(1);
      return row;
    },

    async createProcessing(input) {
      try {
        await db.insert(notificationDeliveries).values({
          ...input,
          provider: "resend",
          status: "processing",
          attemptCount: 1,
        });
        return true;
      } catch (error) {
        if (isDuplicateKeyError(error)) return false;
        throw error;
      }
    },

    async claimFailed(id, processingToken) {
      const result = await db
        .update(notificationDeliveries)
        .set({
          status: "processing",
          processingToken,
          attemptCount: sql`${notificationDeliveries.attemptCount} + 1`,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(notificationDeliveries.id, id),
          eq(notificationDeliveries.status, "failed"),
        ));
      return affectedRows(result) === 1;
    },

    async markSent(input) {
      await db
        .update(notificationDeliveries)
        .set({
          status: "sent",
          processingToken: null,
          providerMessageId: input.providerMessageId,
          lastError: null,
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(notificationDeliveries.id, input.id),
          eq(notificationDeliveries.processingToken, input.processingToken),
        ));
    },

    async markFailed(input) {
      await db
        .update(notificationDeliveries)
        .set({
          status: "failed",
          processingToken: null,
          lastError: input.error.slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(and(
          eq(notificationDeliveries.id, input.id),
          eq(notificationDeliveries.processingToken, input.processingToken),
        ));
    },
  };
}

export async function sendContributionApprovedNotification(
  input: ContributionApprovedNotificationInput,
  dependencies: NotificationDependencies = {},
) {
  const recipientEmail = input.donorEmail?.trim().toLowerCase();
  if (!recipientEmail) return { status: "skipped" as const };

  const idempotencyKey = buildContributionNotificationKey(
    input.contributionId,
    recipientEmail,
  );
  const processingToken = randomUUID();

  try {
    const repository = dependencies.repository
      ?? await createNotificationDeliveryRepository();
    const sender = dependencies.sender ?? sendTransactionalEmail;
    let delivery = await repository.findByKey(idempotencyKey);

    if (delivery?.status === "sent" || delivery?.status === "processing" || delivery?.status === "skipped") {
      return { status: "duplicate" as const };
    }

    if (delivery?.status === "failed") {
      const claimed = await repository.claimFailed(delivery.id, processingToken);
      if (!claimed) return { status: "duplicate" as const };
    } else {
      const created = await repository.createProcessing({
        notificationType: "contribution_approved",
        resourceType: "contribution",
        resourceId: input.contributionId,
        recipientEmail,
        idempotencyKey,
        processingToken,
      });
      if (!created) return { status: "duplicate" as const };
      delivery = await repository.findByKey(idempotencyKey);
      if (!delivery) throw new Error("Registro da notificação não foi localizado após a criação");
    }

    const message = buildContributionApprovedEmail({
      to: recipientEmail,
      donorName: input.donorName,
      campaignTitle: input.campaignTitle,
      amountCents: input.amountCents,
      reference: input.reference,
    });
    const result = await sender(message, idempotencyKey);

    await repository.markSent({
      id: delivery.id,
      processingToken,
      providerMessageId: result.id,
    });
    return { status: "sent" as const, providerMessageId: result.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no envio";
    console.error("[Email] Falha ao confirmar contribuição", {
      contributionId: input.contributionId,
      message,
    });

    try {
      const repository = dependencies.repository
        ?? await createNotificationDeliveryRepository();
      const delivery = await repository.findByKey(idempotencyKey);
      if (delivery?.status === "processing") {
        await repository.markFailed({
          id: delivery.id,
          processingToken,
          error: message,
        });
      }
    } catch (auditError) {
      console.error("[Email] Falha ao registrar erro da notificação", {
        contributionId: input.contributionId,
        message: auditError instanceof Error ? auditError.message : "unknown",
      });
    }

    return { status: "failed" as const, error: message };
  }
}
