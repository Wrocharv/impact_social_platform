import { describe, expect, it, vi } from "vitest";
import {
  buildContributionNotificationKey,
  sendContributionApprovedNotification,
  type NotificationDeliveryRepository,
} from "./notificationDeliveries";
import {
  buildContributionApprovedEmail,
  createResendEmailSender,
} from "./email";

type Status = "processing" | "sent" | "failed" | "skipped";

class MemoryDeliveryRepository implements NotificationDeliveryRepository {
  record?: {
    id: number;
    status: Status;
    attemptCount: number;
    processingToken?: string;
    providerMessageId?: string;
    error?: string;
  };

  async findByKey() {
    if (!this.record) return undefined;
    return {
      id: this.record.id,
      status: this.record.status,
      attemptCount: this.record.attemptCount,
    };
  }

  async createProcessing(input: { processingToken: string }) {
    if (this.record) return false;
    this.record = {
      id: 1,
      status: "processing",
      attemptCount: 1,
      processingToken: input.processingToken,
    };
    return true;
  }

  async claimFailed(id: number, processingToken: string) {
    if (this.record?.id !== id || this.record.status !== "failed") return false;
    this.record.status = "processing";
    this.record.attemptCount += 1;
    this.record.processingToken = processingToken;
    this.record.error = undefined;
    return true;
  }

  async markSent(input: { id: number; processingToken: string; providerMessageId: string }) {
    if (this.record?.id === input.id && this.record.processingToken === input.processingToken) {
      this.record.status = "sent";
      this.record.providerMessageId = input.providerMessageId;
      this.record.processingToken = undefined;
    }
  }

  async markFailed(input: { id: number; processingToken: string; error: string }) {
    if (this.record?.id === input.id && this.record.processingToken === input.processingToken) {
      this.record.status = "failed";
      this.record.error = input.error;
      this.record.processingToken = undefined;
    }
  }
}

const notificationInput = {
  contributionId: 42,
  donorEmail: "Doador@Example.com ",
  donorName: "Maria",
  campaignTitle: "Casa da Viúva",
  amountCents: 5_000,
  reference: "pdb-42-reference",
};

describe("e-mail transacional de contribuição", () => {
  it("gera conteúdo acessível, em pt-BR e escapa conteúdo dinâmico", () => {
    const email = buildContributionApprovedEmail({
      to: "doador@example.com",
      donorName: "<script>alert(1)</script>",
      campaignTitle: "Casa & Esperança",
      amountCents: 5_001,
      reference: "ref<1>",
    });

    expect(email.subject).toContain("Casa & Esperança");
    expect(email.html).toContain("R$ 50,01");
    expect(email.html).toContain("Casa &amp; Esperança");
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.text).toContain("R$ 50,01");
  });

  it("envia ao endpoint oficial com autenticação e chave idempotente", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: "email-123" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const sender = createResendEmailSender({
      apiKey: "re_test_key",
      from: "Parceiros do Bem <impacto@example.org>",
      replyTo: "contato@example.org",
      fetchImpl: fetchMock,
    });

    const result = await sender(
      buildContributionApprovedEmail({
        to: "doador@example.com",
        campaignTitle: "Casa da Viúva",
        amountCents: 5_000,
        reference: "ref-1",
      }),
      "contribution-approved:1:doador@example.com",
    );

    expect(result).toEqual({ id: "email-123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
          "Idempotency-Key": "contribution-approved:1:doador@example.com",
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      from: "Parceiros do Bem <impacto@example.org>",
      to: ["doador@example.com"],
      reply_to: "contato@example.org",
    });
  });
});

describe("registro idempotente de notificações", () => {
  it("normaliza o destinatário na chave estável", () => {
    expect(buildContributionNotificationKey(42, " Doador@Example.com "))
      .toBe("contribution-approved:42:doador@example.com");
  });

  it("registra a tentativa e conclui com o identificador do provedor", async () => {
    const repository = new MemoryDeliveryRepository();
    const sender = vi.fn().mockResolvedValue({ id: "email-1" });

    const result = await sendContributionApprovedNotification(
      notificationInput,
      { repository, sender },
    );

    expect(result).toEqual({ status: "sent", providerMessageId: "email-1" });
    expect(repository.record).toMatchObject({
      status: "sent",
      attemptCount: 1,
      providerMessageId: "email-1",
    });
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("deduplica chamadas concorrentes enquanto a primeira está em processamento", async () => {
    const repository = new MemoryDeliveryRepository();
    let release: ((value: { id: string }) => void) | undefined;
    const sender = vi.fn(() => new Promise<{ id: string }>((resolve) => {
      release = resolve;
    }));

    const first = sendContributionApprovedNotification(
      notificationInput,
      { repository, sender },
    );
    while (!release) await Promise.resolve();

    const duplicate = await sendContributionApprovedNotification(
      notificationInput,
      { repository, sender },
    );
    release({ id: "email-1" });

    expect(duplicate).toEqual({ status: "duplicate" });
    await expect(first).resolves.toEqual({ status: "sent", providerMessageId: "email-1" });
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("registra falha sem lançar e permite uma nova tentativa auditada", async () => {
    const repository = new MemoryDeliveryRepository();
    const failingSender = vi.fn().mockRejectedValue(new Error("provider unavailable"));

    const failed = await sendContributionApprovedNotification(
      notificationInput,
      { repository, sender: failingSender },
    );

    expect(failed).toEqual({ status: "failed", error: "provider unavailable" });
    expect(repository.record).toMatchObject({ status: "failed", attemptCount: 1 });

    const successfulSender = vi.fn().mockResolvedValue({ id: "email-2" });
    const retried = await sendContributionApprovedNotification(
      notificationInput,
      { repository, sender: successfulSender },
    );

    expect(retried).toEqual({ status: "sent", providerMessageId: "email-2" });
    expect(repository.record).toMatchObject({
      status: "sent",
      attemptCount: 2,
      providerMessageId: "email-2",
    });
  });

  it("não tenta enviar quando a contribuição não possui destinatário", async () => {
    const repository = new MemoryDeliveryRepository();
    const sender = vi.fn();

    const result = await sendContributionApprovedNotification(
      { ...notificationInput, donorEmail: null },
      { repository, sender },
    );

    expect(result).toEqual({ status: "skipped" });
    expect(sender).not.toHaveBeenCalled();
  });
});
