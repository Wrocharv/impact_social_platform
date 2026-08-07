import AnimatedProgressBar from "@/components/AnimatedProgressBar";
import PublicHeader from "@/components/PublicHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AlertCircle, BarChart3, ChevronLeft, Download, ReceiptText, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { Link, useRoute } from "wouter";

const formatCurrency = (value: number) =>
  (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type CampaignAccountabilityView = {
  id: number;
  title: string;
  goal: number;
  raised: number;
  documents: Array<{
    id: number;
    title: string;
    amount?: number | null;
    uploadedAt: Date | string;
    documentUrl: string;
    fileName?: string | null;
  }>;
};

export default function CampaignAccountabilityPage() {
  const [, params] = useRoute("/:route/:id");
  const campaignId = Number(params?.id ?? 0);
  const accountabilityInput = useMemo(() => ({ campaignId }), [campaignId]);
  const query = trpc.campaigns.getById.useQuery(
    { id: campaignId },
    { enabled: Number.isInteger(campaignId) && campaignId > 0 },
  );
  const reportQuery = trpc.accountability.getPublicReport.useQuery(accountabilityInput, {
    enabled: Number.isInteger(campaignId) && campaignId > 0,
  });
  const campaign = query.data as CampaignAccountabilityView | null | undefined;
  const totalSpent = reportQuery.data?.financialSummary.totalSpent ?? reportQuery.data?.summary.totalSpent ?? 0;
  const confirmedEntries = reportQuery.data?.financialSummary.totalConfirmedEntries ?? campaign?.raised ?? 0;
  const availableBalance = reportQuery.data?.financialSummary.availableBalance ?? (confirmedEntries - totalSpent);
  const confirmedCount = reportQuery.data?.financialSummary.confirmedContributionsCount ?? 0;
  const documents = reportQuery.data?.documents ?? campaign?.documents ?? [];

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <main className="container max-w-6xl px-4 py-12 md:py-16">
        <Link href={`/campaign/${campaignId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#4f6550] hover:text-[#228B22]">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar à campanha
        </Link>

        {query.isLoading ? (
          <div className="mt-8 space-y-5"><Skeleton className="h-16 w-2/3" /><Skeleton className="h-72 w-full" /></div>
        ) : !query.data || query.isError ? (
          <Card className="mt-8 p-10 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-[#a87508]" aria-hidden="true" />
            <h1 className="mt-4 text-3xl font-bold text-[#2d2d2d]">Prestação de contas indisponível</h1>
            <p className="mt-2 text-[#656565]">A campanha não foi encontrada ou não está publicada.</p>
          </Card>
        ) : (
          <>
            <div className="mt-8">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">Prestação de contas</p>
              <h1 className="mt-3 text-4xl font-bold text-[#2d2d2d] md:text-5xl">{campaign?.title ?? ""}</h1>
              <p className="mt-4 max-w-3xl text-lg text-[#656565]">Valores confirmados, despesas registradas e documentos publicados para esta campanha.</p>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Meta" value={formatCurrency(campaign?.goal ?? 0)} />
              <Metric label="Entradas confirmadas" value={formatCurrency(confirmedEntries)} accent />
              <Metric label="Gasto" value={formatCurrency(totalSpent)} />
              <Metric label="Saldo disponível" value={formatCurrency(availableBalance)} accent={availableBalance >= 0} warning={availableBalance < 0} />
            </div>

            <p className="mt-3 text-sm text-[#66736a]">
              {confirmedCount > 0
                ? `${confirmedCount} contribuição(ões) financeira(s) confirmada(s) compõem o total de entradas.`
                : "Ainda não há contribuições financeiras confirmadas para esta campanha."}
            </p>

            <Card className="mt-6 p-7">
              <h2 className="text-xl font-bold text-[#2d2d2d]">Progresso de arrecadação</h2>
              <div className="mt-5"><AnimatedProgressBar current={confirmedEntries} goal={campaign?.goal ?? 0} animated showLabel /></div>
            </Card>

            <section className="mt-12" aria-labelledby="expenses-title">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-7 w-7 text-[#228B22]" aria-hidden="true" />
                <h2 id="expenses-title" className="text-3xl font-bold text-[#2d2d2d]">Aplicação dos recursos</h2>
              </div>
              {reportQuery.isLoading ? (
                <Skeleton className="mt-6 h-56 w-full" />
              ) : reportQuery.isError || !reportQuery.data ? (
                <Card className="mt-6 border-[#a87508]/25 bg-[#fffaf0] p-6 text-[#70571a]">Não foi possível carregar as despesas publicadas.</Card>
              ) : reportQuery.data.expenses.length > 0 ? (
                <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                  <Card className="p-6">
                    <h3 className="font-bold text-[#2d2d2d]">Distribuição por categoria</h3>
                    <div className="mt-5 space-y-4">
                      {reportQuery.data.summary.byCategory.map((entry) => {
                        const percent = reportQuery.data.summary.totalSpent > 0
                          ? Math.round((entry.amount / reportQuery.data.summary.totalSpent) * 100)
                          : 0;
                        return (
                          <div key={entry.category}>
                            <div className="mb-2 flex justify-between gap-4 text-sm">
                              <span className="font-medium text-[#4f6550]">{categoryLabel(entry.category)}</span>
                              <span className="font-bold">{formatCurrency(entry.amount)} · {percent}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-[#e4ebe2]">
                              <div className="h-full rounded-full bg-[#228B22]" style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  <Card className="overflow-hidden">
                    <div className="border-b px-6 py-5"><h3 className="font-bold text-[#2d2d2d]">Despesas publicadas</h3></div>
                    <div className="divide-y">
                      {reportQuery.data.expenses.map((expense) => (
                        <div key={expense.id} className="flex flex-col justify-between gap-2 px-6 py-4 sm:flex-row sm:items-center">
                          <div>
                            <p className="font-semibold text-[#2d2d2d]">{expense.title}</p>
                            <p className="mt-1 text-sm text-[#787878]">{categoryLabel(expense.category)} · {new Date(expense.expenseDate).toLocaleDateString("pt-BR")}</p>
                          </div>
                          <strong>{formatCurrency(expense.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              ) : (
                <Card className="mt-6 border-dashed p-9 text-center">
                  <ReceiptText className="mx-auto h-9 w-9 text-[#228B22]" aria-hidden="true" />
                  <h3 className="mt-4 font-bold text-[#2d2d2d]">Nenhuma despesa publicada</h3>
                  <p className="mt-2 text-sm text-[#656565]">Os valores aparecerão aqui após o primeiro lançamento validado pela equipe responsável.</p>
                </Card>
              )}
            </section>

            <section className="mt-12" aria-labelledby="documents-title">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-7 w-7 text-[#228B22]" aria-hidden="true" />
                <h2 id="documents-title" className="text-3xl font-bold text-[#2d2d2d]">Documentos publicados</h2>
              </div>
              {documents.length > 0 ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {documents.map((document) => (
                    <Card key={document.id} className="flex items-center justify-between gap-4 p-5">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-[#2d2d2d]">{document.title}</h3>
                        <p className="mt-1 truncate text-sm text-[#787878]">
                          {document.amount ? formatCurrency(document.amount) : "Sem valor associado"}
                          {document.fileName ? ` · ${document.fileName}` : ""}
                        </p>
                      </div>
                      <a href={document.documentUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-2 font-semibold text-[#228B22] hover:underline">
                        <Download className="h-4 w-4" aria-hidden="true" /> Abrir
                      </a>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="mt-6 border-dashed p-9 text-center text-[#656565]">Nenhum documento foi publicado para esta campanha.</Card>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value, accent = false, warning = false }: { label: string; value: string; accent?: boolean; warning?: boolean }) {
  return (
    <Card className="p-6">
      <p className="text-sm text-[#787878]">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${warning ? "text-[#b42318]" : accent ? "text-[#228B22]" : "text-[#2d2d2d]"}`}>{value}</p>
    </Card>
  );
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    materials: "Materiais",
    labor: "Mão de obra",
    equipment: "Equipamentos",
    services: "Serviços",
    transport: "Transporte",
    fees: "Taxas",
    other: "Outros",
  };
  return labels[category] ?? category;
}
