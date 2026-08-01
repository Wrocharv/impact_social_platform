import PublicHeader from "@/components/PublicHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useDonorStorage } from "@/hooks/useDonorStorage";
import { ChevronLeft, Heart, Package } from "lucide-react";
import { Link, useRoute } from "wouter";

type NeedItem = {
  id: number;
  name: string;
  quantity: string | null;
  priority: "high" | "medium" | "low";
  targetQuantityExact?: number | null;
  unitValueCents?: number | null;
  offeredQuantity?: number | null;
  remainingQuantity?: number | null;
  offeredValueCents?: number | null;
  remainingValueCents?: number | null;
  fulfilled?: number | null;
};

const formatCurrency = (valueInCents: number) =>
  (valueInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PREFERRED_KEYWORDS = ["TIJOLO", "CIMENTO", "AREIA", "JANELA"];

const normalizeNeedLabel = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

const priorityWeight = (priority: NeedItem["priority"]) => {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
};

const keywordWeight = (name: string) => {
  const normalized = normalizeNeedLabel(name);
  const idx = PREFERRED_KEYWORDS.findIndex((keyword) => normalized.includes(keyword));
  return idx === -1 ? 99 : idx;
};

const sortNeeds = (needs: NeedItem[]) =>
  [...needs].sort((a, b) => {
    const byPriority = priorityWeight(a.priority) - priorityWeight(b.priority);
    if (byPriority !== 0) return byPriority;

    const byKeyword = keywordWeight(a.name) - keywordWeight(b.name);
    if (byKeyword !== 0) return byKeyword;

    return normalizeNeedLabel(a.name).localeCompare(normalizeNeedLabel(b.name), "pt-BR");
  });

export default function ContributionNeedsPage() {
  const [, params] = useRoute("/contribute/items/:id");
  const campaignId = Number(params?.id ?? 0);
  const { isLoaded, currentDonor } = useDonorStorage();

  const campaignQuery = trpc.campaigns.getById.useQuery(
    { id: campaignId },
    { enabled: Number.isInteger(campaignId) && campaignId > 0 },
  );

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return (
      <div className="min-h-screen bg-[#f8faf7]">
        <PublicHeader />
        <div className="container max-w-5xl px-4 py-16">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold text-[#2d2d2d]">Campanha inválida</h1>
            <p className="mt-2 text-[#656565]">Não foi possível abrir a lista de necessidades.</p>
          </Card>
        </div>
      </div>
    );
  }

  if (campaignQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#f8faf7]">
        <PublicHeader />
        <div className="container max-w-5xl px-4 py-16">
          <Skeleton className="h-14 w-72" />
          <Skeleton className="mt-6 h-72 w-full" />
        </div>
      </div>
    );
  }

  const campaign = campaignQuery.data;

  if (campaignQuery.isError || !campaign) {
    return (
      <div className="min-h-screen bg-[#f8faf7]">
        <PublicHeader />
        <div className="container max-w-5xl px-4 py-16">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold text-[#2d2d2d]">Campanha não encontrada</h1>
            <p className="mt-2 text-[#656565]">A campanha pode não estar publicada no momento.</p>
          </Card>
        </div>
      </div>
    );
  }

  const needs = sortNeeds((campaign.needs ?? []) as NeedItem[]);
  const hasSingleRegistration = isLoaded && !!currentDonor;

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <main className="container max-w-5xl px-4 py-10 md:py-14">
        <Link href={`/campaign/${campaignId}`} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#4f6550] hover:text-[#228B22]">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar à campanha
        </Link>

        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">{campaign.title}</p>
        <h1 className="mt-2 text-3xl font-bold text-[#2d2d2d] md:text-4xl">Veja o que estamos precisando</h1>
        <p className="mt-3 text-[#656565]">Escolha um item da lista para ajudar com material. Cada oferta calcula automaticamente o valor equivalente e o saldo restante.</p>

        {!hasSingleRegistration && (
          <Card className="mt-6 border-[#dbe7d8] bg-[#f5faf4] p-5">
            <p className="text-sm font-semibold text-[#2d2d2d]">Cadastro único obrigatório</p>
            <p className="mt-1 text-sm text-[#5b655c]">Antes de escolher item ou valor em dinheiro, faça seu cadastro uma única vez para registrar corretamente sua contribuição.</p>
            <Link
              href={`/contribute/wizard/${campaignId}?entry=needs`}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[#228B22] px-4 font-semibold text-white transition hover:bg-[#1b711b]"
            >
              Fazer cadastro único
            </Link>
          </Card>
        )}

        <Card className="mt-7 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#eef3ec] text-[#2d2d2d]">
                <tr>
                  <th className="px-4 py-3 font-semibold">ITEM</th>
                  <th className="px-4 py-3 font-semibold">META EXATA</th>
                  <th className="px-4 py-3 font-semibold">VALOR UNITÁRIO</th>
                  <th className="px-4 py-3 font-semibold">JÁ OFERTADO</th>
                  <th className="px-4 py-3 font-semibold">FALTAM</th>
                  <th className="px-4 py-3 font-semibold">VALOR EQUIVALENTE</th>
                  <th className="px-4 py-3 font-semibold">AÇÃO</th>
                </tr>
              </thead>
              <tbody>
                {needs.length > 0 ? needs.map((need) => (
                  <tr key={need.id} className="border-t border-[#e2e9df]">
                    <td className="px-4 py-3 font-semibold text-[#2d2d2d]">{normalizeNeedLabel(need.name)}</td>
                    <td className="px-4 py-3 text-[#4d5e4f]">{need.targetQuantityExact ?? 0}</td>
                    <td className="px-4 py-3 text-[#4d5e4f]">{formatCurrency(need.unitValueCents ?? 0)}</td>
                    <td className="px-4 py-3 text-[#4d5e4f]">{need.offeredQuantity ?? 0}</td>
                    <td className="px-4 py-3 text-[#4d5e4f]">{need.remainingQuantity ?? Math.max(0, (need.targetQuantityExact ?? 0) - (need.offeredQuantity ?? 0))}</td>
                    <td className="px-4 py-3 text-[#4d5e4f]">
                      <div className="font-medium">{formatCurrency(need.offeredValueCents ?? 0)}</div>
                      <div className="text-xs text-[#6f7e71]">Saldo: {formatCurrency(need.remainingValueCents ?? 0)}</div>
                    </td>
                    <td className="px-4 py-3">
                      {hasSingleRegistration ? (
                        <Link
                          href={`/contribute/wizard/${campaignId}?type=material&needId=${need.id}`}
                          className="inline-flex min-h-10 items-center rounded-md bg-[#228B22] px-4 font-semibold text-white transition hover:bg-[#1b711b]"
                        >
                          <Package className="mr-2 h-4 w-4" aria-hidden="true" /> Oferecer este item
                        </Link>
                      ) : (
                        <Link
                          href={`/contribute/wizard/${campaignId}?entry=needs`}
                          className="inline-flex min-h-10 items-center rounded-md border border-[#228B22] px-4 font-semibold text-[#228B22] transition hover:bg-[#228B22]/5"
                        >
                          Fazer cadastro para liberar
                        </Link>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[#656565]">A lista de necessidades está sendo atualizada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {hasSingleRegistration ? (
            <Link href={`/contribute/wizard/${campaignId}?type=financial`} className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#1f3d2b] px-5 font-semibold text-white transition hover:bg-[#163021]">
              <Heart className="mr-2 h-5 w-5" aria-hidden="true" /> Doar valor em dinheiro
            </Link>
          ) : (
            <Link href={`/contribute/wizard/${campaignId}?entry=needs`} className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#1f3d2b] px-5 font-semibold text-[#1f3d2b] transition hover:bg-[#1f3d2b]/5">
              Fazer cadastro único para doar
            </Link>
          )}
          <Link href={`/contribute/wizard/${campaignId}?type=material`} className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#228B22] px-5 font-semibold text-[#228B22] hover:bg-[#228B22]/5">
            Abrir formulário completo
          </Link>
        </div>
      </main>
    </div>
  );
}
