import PublicHeader from "@/components/PublicHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { FileText, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { Link } from "wouter";

const formatCurrency = (value: number) =>
  (value / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

export default function AccountabilityIndexPage() {
  const input = useMemo(() => ({ limit: 50 }), []);
  const campaignsQuery = trpc.campaigns.listPublished.useQuery(input);
  const campaigns = campaignsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-[#f7f9f6] text-[#2d2d2d]">
      <PublicHeader />
      <main>
        <section className="border-b bg-white py-16 md:py-20">
          <div className="container max-w-7xl px-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#228B22]">Transparência</p>
            <h1 className="mt-4 max-w-4xl text-5xl font-bold leading-tight md:text-6xl">Prestação de contas por campanha</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#656565]">
              Consulte valores confirmados, necessidades, atualizações e documentos publicados pela equipe responsável.
            </p>
          </div>
        </section>

        <section className="py-14 md:py-20">
          <div className="container max-w-7xl px-4">
            {campaignsQuery.isLoading && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-64 rounded-xl" />)}
              </div>
            )}

            {campaignsQuery.isError && (
              <Card className="p-10 text-center">
                <h2 className="text-2xl font-bold">Não foi possível carregar os relatórios</h2>
                <p className="mt-2 text-[#656565]">Tente novamente em alguns instantes.</p>
              </Card>
            )}

            {!campaignsQuery.isLoading && !campaignsQuery.isError && campaigns.length === 0 && (
              <Card className="border-dashed p-10 text-center">
                <ShieldCheck className="mx-auto h-10 w-10 text-[#228B22]" aria-hidden="true" />
                <h2 className="mt-4 text-2xl font-bold">Nenhum relatório público disponível</h2>
                <p className="mx-auto mt-2 max-w-2xl text-[#656565]">
                  As prestações aparecerão aqui quando as primeiras campanhas forem publicadas com seus dados de transparência.
                </p>
              </Card>
            )}

            {campaigns.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {campaigns.map((campaign) => (
                  <Card key={campaign.id} className="flex h-full flex-col p-7 shadow-sm">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#228B22]/10">
                      <FileText className="h-5 w-5 text-[#228B22]" aria-hidden="true" />
                    </div>
                    <h2 className="mt-5 text-2xl font-bold">{campaign.title}</h2>
                    <p className="mt-3 line-clamp-3 text-[#656565]">{campaign.description}</p>
                    <dl className="mt-6 grid grid-cols-2 gap-4 border-t pt-5 text-sm">
                      <div>
                        <dt className="text-[#787878]">Confirmado</dt>
                        <dd className="mt-1 font-bold text-[#228B22]">{formatCurrency(campaign.raised)}</dd>
                      </div>
                      <div>
                        <dt className="text-[#787878]">Meta</dt>
                        <dd className="mt-1 font-bold">{formatCurrency(campaign.goal)}</dd>
                      </div>
                    </dl>
                    <Link
                      href={`/accountability/${campaign.id}`}
                      className="mt-7 inline-flex min-h-11 items-center justify-center rounded-md bg-[#228B22] px-5 font-semibold text-white transition hover:bg-[#1a6b1a] active:scale-[0.97]"
                    >
                      Ver prestação de contas
                    </Link>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
