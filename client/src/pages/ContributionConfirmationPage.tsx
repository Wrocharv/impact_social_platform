import PublicHeader from "@/components/PublicHeader";
import { Card } from "@/components/ui/card";
import { CheckCircle, Heart, ArrowRight, Printer, Download, Clock3 } from "lucide-react";
import { Link } from "wouter";

interface ContributionData {
  type: "financial" | "material" | "volunteer";
  campaignTitle: string;
  campaignId: number;
  donorName: string;
  amount?: number;
  description?: string;
  timestamp: string;
}

export default function ContributionConfirmationPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const paymentMethod = searchParams.get("paymentMethod");
  const paymentStatus = searchParams.get("paymentStatus");
  const data: ContributionData = {
    type: (searchParams.get("type") as any) || "financial",
    campaignTitle: searchParams.get("campaign") || "Campanha",
    campaignId: Number(searchParams.get("campaignId")) || 0,
    donorName: searchParams.get("donor") || "Doador",
    amount: searchParams.get("amount") ? Number(searchParams.get("amount")) : undefined,
    description: searchParams.get("description") || undefined,
    timestamp: new Date().toLocaleString("pt-BR"),
  };

  const firstName = data.donorName.trim().split(" ")[0] || "Doador";
  const receiptNumber = `RCB-${Date.now().toString(36).toUpperCase()}`;
  const isCashAwaitingValidation =
    data.type === "financial" && paymentMethod === "cash" && paymentStatus === "awaiting_validation";

  const typeConfig = {
    financial: { icon: "💰", label: "Doação Financeira", color: "blue" },
    material: { icon: "📦", label: "Doação de Material", color: "green" },
    volunteer: { icon: "🤝", label: "Voluntariado", color: "purple" },
  };

  const isLegendarioCampaign = data.campaignTitle.trim().toUpperCase() === "LEGENDARIO SOLIDARIO";
  const config = data.type === "material" && isLegendarioCampaign
    ? { ...typeConfig.material, label: "Kit completo ou itens do kit" }
    : typeConfig[data.type];

  const pageTitle = isCashAwaitingValidation ? "Aguardando Validação Presencial" : "Contribuição Registrada!";
  const pageDescription = isCashAwaitingValidation
    ? "Sua intenção de doação em dinheiro foi registrada e precisa ser validada por quem recebeu presencialmente."
    : `Sua ${config.label.toLowerCase()} foi recebida com sucesso`;
  const badgeTitle = isCashAwaitingValidation
    ? `Obrigado, ${firstName}! Estamos aguardando a validação do recebedor presencial.`
    : `Obrigado, ${firstName}! Sua generosidade impacta vidas.`;
  const badgeDescription = isCashAwaitingValidation
    ? "O valor só será contabilizado na campanha após a confirmação oficial do recebimento."
    : "Guarde este recibo digital caso deseje registrar sua contribuição.";

  const receiptHtml = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Recibo de Contribuição - ${receiptNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
          .box { border: 1px solid #d1d5db; border-radius: 12px; padding: 24px; max-width: 720px; margin: 0 auto; }
          h1 { margin: 0 0 8px; color: #166534; }
          .muted { color: #6b7280; font-size: 14px; }
          .row { margin-top: 14px; }
          .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
          .value { font-size: 16px; font-weight: 600; margin-top: 2px; }
          .footer { margin-top: 24px; font-size: 12px; color: #4b5563; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Recibo de Contribuição</h1>
          <p class="muted">Comprovante emitido pelo site Parceiros do Bem</p>
          <div class="row"><div class="label">Recibo</div><div class="value">${receiptNumber}</div></div>
          <div class="row"><div class="label">Data e hora</div><div class="value">${data.timestamp}</div></div>
          <div class="row"><div class="label">Doador</div><div class="value">${data.donorName}</div></div>
          <div class="row"><div class="label">Campanha</div><div class="value">${data.campaignTitle}</div></div>
          <div class="row"><div class="label">Tipo</div><div class="value">${config.label}</div></div>
          <div class="row"><div class="label">Valor</div><div class="value">${data.amount ? `R$ ${(data.amount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Não financeiro"}</div></div>
          ${data.description ? `<div class="row"><div class="label">Descrição</div><div class="value">${data.description}</div></div>` : ""}
          <p class="footer">Obrigado por contribuir com transformação social.</p>
        </div>
      </body>
    </html>
  `;

  const handlePrintReceipt = () => {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleDownloadReceipt = () => {
    const blob = new Blob([receiptHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${receiptNumber}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PublicHeader />
      <main className="min-h-screen bg-gradient-to-b from-[#f0fdf4] to-white">
        <div className="mx-auto max-w-2xl px-4 py-12 md:py-20">
          {/* Success Badge */}
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className={`absolute inset-0 blur-xl rounded-full ${isCashAwaitingValidation ? "bg-amber-300/30" : "bg-green-400/20"}`}></div>
              {isCashAwaitingValidation ? (
                <Clock3 className="relative h-24 w-24 text-amber-600 animate-pulse" />
              ) : (
                <CheckCircle className="relative h-24 w-24 text-green-600 animate-pulse" />
              )}
            </div>
          </div>

          {/* Main Content */}
          <Card className={`border-2 p-8 ${isCashAwaitingValidation ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white" : "border-green-200 bg-gradient-to-br from-green-50 to-white"}`}>
            <div className="text-center mb-8">
              <h1 className={`text-3xl font-bold mb-2 ${isCashAwaitingValidation ? "text-amber-700" : "text-green-600"}`}>{pageTitle}</h1>
              <p className="text-gray-600">{pageDescription}</p>
            </div>

            <div className={`mb-8 rounded-lg border p-4 text-center ${isCashAwaitingValidation ? "border-amber-200 bg-amber-100/70" : "border-green-200 bg-green-100/60"}`}>
              <p className={`font-semibold ${isCashAwaitingValidation ? "text-amber-900" : "text-green-800"}`}>{badgeTitle}</p>
              <p className={`text-sm mt-1 ${isCashAwaitingValidation ? "text-amber-800" : "text-green-700"}`}>{badgeDescription}</p>
            </div>

            {/* Contribution Details */}
            <div className="space-y-4 mb-8 p-6 bg-white rounded-lg border border-green-100">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Tipo de Contribuição</p>
                  <p className="font-semibold text-lg text-gray-900">{config.label}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Seu Nome</p>
                  <p className="font-semibold text-lg text-gray-900">{data.donorName}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600">Campanha</p>
                <p className="font-semibold text-lg text-gray-900">{data.campaignTitle}</p>
              </div>

              {data.amount && (
                <div>
                  <p className="text-sm text-gray-600">Valor</p>
                  <p className="font-semibold text-2xl text-green-600">
                    R$ {(data.amount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}

              {data.description && (
                <div>
                  <p className="text-sm text-gray-600">Descrição</p>
                  <p className="font-semibold text-gray-900">{data.description}</p>
                </div>
              )}

              <div className="text-right">
                <p className="text-xs text-gray-500">{data.timestamp}</p>
              </div>
            </div>

            {!isCashAwaitingValidation && (
              <div className="mb-8 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={handlePrintReceipt}
                  className="inline-flex items-center justify-center gap-2 min-h-12 rounded-md border-2 border-gray-300 px-4 py-3 font-semibold text-gray-700 hover:bg-gray-50 transition active:scale-95"
                >
                  <Printer className="h-4 w-4" /> Imprimir Recibo
                </button>
                <button
                  onClick={handleDownloadReceipt}
                  className="inline-flex items-center justify-center gap-2 min-h-12 rounded-md border-2 border-green-600 px-4 py-3 font-semibold text-green-700 hover:bg-green-50 transition active:scale-95"
                >
                  <Download className="h-4 w-4" /> Baixar Recibo
                </button>
              </div>
            )}

            {/* Next Steps */}
            <div className="mb-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                O que acontece agora?
              </h2>
              <ul className="space-y-2 text-sm text-gray-700">
                {isCashAwaitingValidation ? (
                  <>
                    <li className="flex items-start gap-3">
                      <span className="font-bold text-blue-600 flex-shrink-0">1.</span>
                      <span>O responsável pelo recebimento presencial precisa validar que o valor foi realmente entregue.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="font-bold text-blue-600 flex-shrink-0">2.</span>
                      <span>Somente após essa validação o valor será contabilizado oficialmente na campanha.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="font-bold text-blue-600 flex-shrink-0">3.</span>
                      <span>Se precisar, apresente este protocolo ao recebedor para conferência da contribuição.</span>
                    </li>
                  </>
                ) : (
                  <>
                    <li className="flex items-start gap-3">
                      <span className="font-bold text-blue-600 flex-shrink-0">1.</span>
                      <span>A equipe responsável receberá sua contribuição e fará a triagem</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="font-bold text-blue-600 flex-shrink-0">2.</span>
                      <span>Você receberá um contato por WhatsApp para confirmação e próximos passos</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="font-bold text-blue-600 flex-shrink-0">3.</span>
                      <span>Acompanhe o progresso da campanha em tempo real</span>
                    </li>
                  </>
                )}
              </ul>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href={`/campaign/${data.campaignId}`}
                className="inline-flex items-center justify-center gap-2 min-h-12 px-6 py-3 rounded-md bg-green-600 text-white font-semibold hover:bg-green-700 transition active:scale-95"
              >
                Ver Campanha <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/campaigns"
                className="inline-flex items-center justify-center gap-2 min-h-12 px-6 py-3 rounded-md border-2 border-green-600 text-green-600 font-semibold hover:bg-green-50 transition active:scale-95"
              >
                <Heart className="h-4 w-4" /> Explorar Mais Campanhas
              </Link>
            </div>
          </Card>

          {/* Thank You Message */}
          <div className="mt-12 text-center">
            <p className="text-gray-600 max-w-lg mx-auto">
              <span className="font-semibold text-green-600">Muito obrigado</span> por fazer parte desta transformação!
              Sua contribuição faz a diferença e ajuda a construir um futuro melhor.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
