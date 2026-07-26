import CampaignCard from "@/components/CampaignCard";
import PublicHeader from "@/components/PublicHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

type StatusFilter = "all" | "active" | "completed";

export default function CampaignsPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const input = useMemo(
    () => ({
      status: status === "all" ? undefined : status,
      query: deferredQuery || undefined,
      limit: 50,
    }),
    [deferredQuery, status],
  );
  const campaignsQuery = trpc.campaigns.listPublished.useQuery(input);
  const campaigns = campaignsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <header className="border-b border-[#e2e7e0] bg-white py-14 md:py-20">
        <div className="container max-w-7xl px-4">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#228B22]">Campanhas públicas</p>
          <h1 className="max-w-3xl text-4xl font-bold text-[#2d2d2d] md:text-6xl">Escolha como você quer transformar uma realidade</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#6d6d6d]">
            Consulte metas, necessidades e documentos de cada projeto antes de contribuir.
          </p>
        </div>
      </header>

      <main className="container max-w-7xl px-4 py-12 md:py-16">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#787878]" aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar campanha pelo nome"
              className="h-11 bg-white pl-10"
              aria-label="Buscar campanha pelo nome"
            />
          </div>
          <div className="flex rounded-lg border border-[#dcdcdc] bg-white p-1" aria-label="Filtrar campanhas por status">
            {([
              ["all", "Todas"],
              ["active", "Ativas"],
              ["completed", "Concluídas"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition active:scale-[0.97] ${
                  status === value ? "bg-[#228B22] text-white" : "text-[#5f5f5f] hover:bg-[#f1f5f0]"
                }`}
                aria-pressed={status === value}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {campaignsQuery.isLoading && (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-[460px] rounded-xl" />)}
          </div>
        )}
        {campaignsQuery.isError && (
          <Card className="p-10 text-center">
            <h2 className="text-2xl font-semibold text-[#2d2d2d]">Não foi possível consultar as campanhas</h2>
            <p className="mt-2 text-[#6d6d6d]">Verifique sua conexão e tente novamente.</p>
          </Card>
        )}
        {!campaignsQuery.isLoading && !campaignsQuery.isError && campaigns.length === 0 && (
          <Card className="border-dashed p-12 text-center">
            <h2 className="text-2xl font-semibold text-[#2d2d2d]">Nenhuma campanha encontrada</h2>
            <p className="mt-2 text-[#6d6d6d]">
              {query ? "Tente outro termo ou ajuste o filtro." : "As próximas campanhas serão publicadas aqui."}
            </p>
          </Card>
        )}
        {campaigns.length > 0 && (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}
          </div>
        )}
      </main>
    </div>
  );
}
