import PublicHeader from "@/components/PublicHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Heart, Package } from "lucide-react";
import { Link, useRoute } from "wouter";

export default function ContributionNeedsPage() {
  const [, params] = useRoute("/contribute/items/:id");
  const campaignId = Number(params?.id ?? 0);

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

  const needs = campaign.needs ?? [];

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <main className="container max-w-5xl px-4 py-10 md:py-14">
        <Link href={`/campaign/${campaignId}`} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#4f6550] hover:text-[#228B22]">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar à campanha
        </Link>

        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">{campaign.title}</p>
        <h1 className="mt-2 text-3xl font-bold text-[#2d2d2d] md:text-4xl">Veja o que estamos precisando</h1>
        <p className="mt-3 text-[#656565]">Escolha um item da lista para ajudar com material. Se preferir, faça doação em dinheiro apenas na etapa de pagamento.</p>

        <Card className="mt-7 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#eef3ec] text-[#2d2d2d]">
                <tr>
                  <th className="px-4 py-3 font-semibold">ITEM</th>
                  <th className="px-4 py-3 font-semibold">NOSSA META</th>
                  <th className="px-4 py-3 font-semibold">QUANTIDADE</th>
                  <th className="px-4 py-3 font-semibold">ATENDIDO</th>
                  <th className="px-4 py-3 font-semibold">AÇÃO</th>
                </tr>
              </thead>
              <tbody>
                {needs.length > 0 ? needs.map((need) => (
                  <tr key={need.id} className="border-t border-[#e2e9df]">
                    <td className="px-4 py-3 font-semibold text-[#2d2d2d]">{need.name.toUpperCase()}</td>
                    <td className="px-4 py-3 text-[#4d5e4f]">{need.quantity || "A definir"}</td>
                    <td className="px-4 py-3 text-[#4d5e4f]">{need.quantity || "A definir"}</td>
                    <td className="px-4 py-3 text-[#4d5e4f]">{need.fulfilled ?? 0}%</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/contribute/wizard/${campaignId}?type=material&needId=${need.id}`}
                        className="inline-flex min-h-10 items-center rounded-md bg-[#228B22] px-4 font-semibold text-white transition hover:bg-[#1b711b]"
                      >
                        <Package className="mr-2 h-4 w-4" aria-hidden="true" /> Oferecer este item
                      </Link>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[#656565]">A lista de necessidades está sendo atualizada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href={`/checkout/${campaignId}`} className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#1f3d2b] px-5 font-semibold text-white transition hover:bg-[#163021]">
            <Heart className="mr-2 h-5 w-5" aria-hidden="true" /> Fazer doação em dinheiro
          </Link>
          <Link href={`/contribute/wizard/${campaignId}`} className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#228B22] px-5 font-semibold text-[#228B22] hover:bg-[#228B22]/5">
            Abrir formulário completo
          </Link>
        </div>
      </main>
    </div>
  );
}
