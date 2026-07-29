import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { Link } from "wouter";

type ReturnState = "success" | "pending" | "failure";

const content: Record<ReturnState, {
  eyebrow: string;
  title: string;
  description: string;
  note: string;
  icon: typeof CheckCircle2;
  iconClass: string;
}> = {
  success: {
    eyebrow: "Retorno da conta do Mercado Pago",
    title: "Pagamento enviado para confirmação",
    description: "A conta do Mercado Pago recebeu a operação. A contribuição aparecerá no total da campanha somente depois da confirmação segura enviada ao nosso servidor.",
    note: "Não feche esta etapa esperando uma confirmação imediata: pagamentos podem permanecer pendentes por alguns minutos.",
    icon: CheckCircle2,
    iconClass: "text-[#228B22]",
  },
  pending: {
    eyebrow: "Pagamento em análise",
    title: "Aguardando confirmação",
    description: "A operação ainda está pendente no Mercado Pago. O valor não será contabilizado antes da aprovação oficial.",
    note: "Pagamentos por PIX ou cartão podem mudar de estado após esta tela. A atualização será processada automaticamente pelo Webhook.",
    icon: Clock3,
    iconClass: "text-[#a87508]",
  },
  failure: {
    eyebrow: "Pagamento não concluído",
    title: "A contribuição financeira não foi confirmada",
    description: "O Mercado Pago informou que o checkout não foi concluído. Nenhum valor será somado à campanha sem uma aprovação verificável.",
    note: "Você pode retornar à campanha e tentar novamente. Se houver cobrança no seu extrato, aguarde a atualização do provedor antes de repetir a operação.",
    icon: XCircle,
    iconClass: "text-[#b42318]",
  },
};

export default function PaymentReturnPage({ state }: { state: ReturnState }) {
  const item = content[state];
  const Icon = item.icon;

  return (
    <div className="min-h-screen bg-[#f8faf7] text-[#2d2d2d]">
      <PublicHeader />
      <main className="container max-w-2xl px-4 py-16 md:py-24">
        <Card className="border-[#dfe7dd] p-7 shadow-sm md:p-10">
          <Icon className={`h-12 w-12 ${item.iconClass}`} aria-hidden="true" />
          <p className="mt-7 text-sm font-semibold uppercase tracking-[0.16em] text-[#4f6550]">{item.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">{item.title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-[#656565]">{item.description}</p>
          <div className="mt-7 flex gap-3 rounded-xl border border-[#d7e2d4] bg-[#f1f6ef] p-4 text-sm leading-relaxed text-[#405240]">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
            <p>{item.note}</p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Button asChild className="min-h-12 bg-[#228B22] font-semibold text-white hover:bg-[#1b711b]">
              <Link href="/campaigns">Voltar às campanhas</Link>
            </Button>
            {state === "failure" && (
              <Button asChild variant="outline" className="min-h-12 border-[#228B22]/30 font-semibold text-[#228B22]">
                <Link href="/campaigns">Tentar outra campanha</Link>
              </Button>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
