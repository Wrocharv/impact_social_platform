import { ENV } from "./_core/env";

export type TransactionalEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailSendResult = {
  id: string;
};

export type EmailSender = (
  message: TransactionalEmail,
  idempotencyKey: string,
) => Promise<EmailSendResult>;

type ResendSenderOptions = {
  apiKey?: string;
  from?: string;
  replyTo?: string;
  fetchImpl?: typeof fetch;
};

type ContributionApprovedEmailInput = {
  to: string;
  donorName?: string | null;
  campaignTitle: string;
  amountCents: number;
  reference: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCurrency(amountCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amountCents / 100);
}

export function buildContributionApprovedEmail(
  input: ContributionApprovedEmailInput,
): TransactionalEmail {
  const amount = formatCurrency(input.amountCents);
  const greeting = input.donorName?.trim()
    ? `Olá, ${input.donorName.trim()}!`
    : "Olá!";
  const safeGreeting = escapeHtml(greeting);
  const safeCampaign = escapeHtml(input.campaignTitle);
  const safeAmount = escapeHtml(amount);
  const safeReference = escapeHtml(input.reference);

  return {
    to: input.to,
    subject: `Contribuição confirmada — ${input.campaignTitle}`,
    html: `
      <!doctype html>
      <html lang="pt-BR">
        <body style="margin:0;background:#f5f7f3;color:#26332a;font-family:Arial,sans-serif;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f5f7f3;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #dfe7dc;border-radius:16px;overflow:hidden;">
                  <tr><td style="height:8px;background:#228b22;"></td></tr>
                  <tr>
                    <td style="padding:32px;">
                      <p style="margin:0 0 20px;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#228b22;font-weight:700;">Parceiros do Bem</p>
                      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#173f20;">Contribuição confirmada</h1>
                      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${safeGreeting}</p>
                      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Recebemos a confirmação do seu pagamento para a campanha <strong>${safeCampaign}</strong>. Obrigado por transformar solidariedade em impacto concreto.</p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;background:#f6faf4;border-radius:12px;">
                        <tr><td style="padding:20px 20px 8px;color:#5f6f63;font-size:13px;">Valor confirmado</td></tr>
                        <tr><td style="padding:0 20px 20px;color:#228b22;font-size:28px;font-weight:700;">${safeAmount}</td></tr>
                      </table>
                      <p style="margin:0 0 8px;font-size:13px;color:#66736a;">Referência da contribuição</p>
                      <p style="margin:0 0 24px;font-size:14px;color:#26332a;word-break:break-all;">${safeReference}</p>
                      <p style="margin:0;font-size:14px;line-height:1.6;color:#66736a;">Guarde esta mensagem para sua conferência. A prestação de contas da campanha permanece disponível publicamente na plataforma.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `.trim(),
    text: [
      greeting,
      "",
      `Sua contribuição para a campanha ${input.campaignTitle} foi confirmada.`,
      `Valor: ${amount}`,
      `Referência: ${input.reference}`,
      "",
      "Obrigado por transformar solidariedade em impacto concreto.",
      "Parceiros do Bem",
    ].join("\n"),
  };
}

export function createResendEmailSender(
  options: ResendSenderOptions = {},
): EmailSender {
  return async (message, idempotencyKey) => {
    const apiKey = options.apiKey ?? ENV.resendApiKey;
    const from = options.from ?? ENV.emailFrom;
    const replyTo = options.replyTo ?? ENV.emailReplyTo;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;

    if (!apiKey || !from) {
      throw new Error("Envio de e-mail não configurado: informe RESEND_API_KEY e EMAIL_FROM");
    }

    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(8_000),
    });

    const payload = await response.json().catch(() => null) as {
      id?: string;
      message?: string;
      name?: string;
    } | null;

    if (!response.ok || !payload?.id) {
      const detail = payload?.message || payload?.name || `HTTP ${response.status}`;
      throw new Error(`Falha no envio transacional: ${detail}`);
    }

    return { id: payload.id };
  };
}

export const sendTransactionalEmail = createResendEmailSender();
