import PublicHeader from "@/components/PublicHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isLegendarioCampaign } from "@/lib/campaignVisibility";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Crown, Heart, Handshake } from "lucide-react";
import { Link, useRoute } from "wouter";

const SPECIAL_APARTMENT_DONATION_CENTS = 120_000_00;

type HelpTierOption = "material" | "financial" | "vip";
const DEFAULT_HELP_TIER_OPTIONS: HelpTierOption[] = ["material", "financial", "vip"];

const formatCurrency = (valueInCents: number) =>
  (valueInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ContributionChoicePage() {
  const [, params] = useRoute("/contribute/help/:id");
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
            <p className="mt-2 text-[#656565]">Não foi possível abrir as opções de ajuda.</p>
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

  if (campaignQuery.isError || !campaignQuery.data) {
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

  const campaign = campaignQuery.data;
  const normalizedHelpTierOptions = Array.isArray((campaign as { helpTierOptions?: unknown }).helpTierOptions)
    ? ((campaign as { helpTierOptions?: HelpTierOption[] }).helpTierOptions ?? DEFAULT_HELP_TIER_OPTIONS)
    : DEFAULT_HELP_TIER_OPTIONS;
  const visibleHelpTierOptions = normalizedHelpTierOptions.filter((option) => DEFAULT_HELP_TIER_OPTIONS.includes(option));
  const vipApartmentAmountCents = ("vipApartmentAmountCents" in campaign && typeof campaign.vipApartmentAmountCents === "number")
    ? campaign.vipApartmentAmountCents
    : SPECIAL_APARTMENT_DONATION_CENTS;
  const legendarioCampaign = isLegendarioCampaign(campaign);
  const hasVipOffer = !legendarioCampaign && visibleHelpTierOptions.includes("vip") && vipApartmentAmountCents > 0;
  const visibleCardCount = [visibleHelpTierOptions.includes("material"), visibleHelpTierOptions.includes("financial"), hasVipOffer].filter(Boolean).length;
  const gridClassName = visibleCardCount === 1 ? "md:grid-cols-1" : visibleCardCount === 2 ? "md:grid-cols-2" : "md:grid-cols-3";

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <main className="container max-w-5xl px-4 py-6 md:py-8">
        <Link href={`/campaign/${campaignId}`} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#4f6550] hover:text-[#228B22]">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar à campanha
        </Link>

        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">{campaign.title}</p>
          <h1 className="mt-2 text-3xl font-bold text-[#2d2d2d] md:text-4xl">Escolha como você quer ajudar</h1>
          <p className="mx-auto mt-3 max-w-3xl text-[#656565]">Cada formato agora está em uma página separada para não misturar os fluxos.</p>
        </div>

        <div className={`mt-6 grid gap-4 ${gridClassName}`}>
          {visibleHelpTierOptions.includes("material") ? (
            <Card className="flex h-full flex-col border-2 border-[#aeb4be] bg-gradient-to-b from-[#f4f4f5] via-[#d9dde3] to-[#bcc4cf] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <h2 className="text-center text-[1.6rem] font-black uppercase tracking-[0.03em] text-[#3f4754] md:text-[1.7rem]">🥈 Prata</h2>
              <p className="mt-2 text-center text-base font-extrabold text-[#505a68]">Doação detalhada ou avulsa</p>
              <p className="mt-2 flex min-h-[56px] items-center justify-center rounded-md bg-black/70 px-3 py-1.5 text-center text-sm font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,0.22)]">Lista de itens da campanha com quantidade e confirmação.</p>
              <Link
                href={`/contribute/items/${campaignId}`}
                className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#6a7484] px-4 text-sm font-extrabold uppercase tracking-[0.04em] text-white transition hover:bg-[#545d6b]"
              >
                <Handshake className="mr-2 h-4 w-4" aria-hidden="true" /> Ir para materiais
              </Link>
            </Card>
          ) : null}

          {visibleHelpTierOptions.includes("financial") ? (
            <Card className="flex h-full flex-col border-2 border-[#95502a] bg-gradient-to-b from-[#f3c9ae] via-[#cc8358] to-[#9e5834] p-5 shadow-[inset_0_1px_0_rgba(255,230,210,0.55)]">
              <h2 className="text-center text-[1.6rem] font-black uppercase tracking-[0.03em] text-[#5d240d] md:text-[1.7rem]">🥉 Bronze</h2>
              <p className="mt-2 text-center text-base font-extrabold text-[#662d12]">Doação financeira</p>
              <p className="mt-2 flex min-h-[56px] items-center justify-center rounded-md bg-black/70 px-3 py-1.5 text-center text-sm font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,0.22)]">Doação única ou parcelada, com confirmação no wizard financeiro.</p>
              <Link
                href={`/contribute/wizard/${campaignId}?type=financial`}
                className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#7f3f1a] px-4 text-sm font-extrabold uppercase tracking-[0.04em] text-white transition hover:bg-[#643114]"
              >
                <Heart className="h-4 w-4" aria-hidden="true" />
                <span className="text-center">Ir para doação em dinheiro</span>
              </Link>
            </Card>
          ) : null}

          {hasVipOffer ? (
            <Card className="flex h-full flex-col border-2 border-[#c5961a] bg-gradient-to-b from-[#fff3bf] via-[#f0ce68] to-[#d9a729] p-5 shadow-[inset_0_1px_0_rgba(255,248,203,0.8)]">
              <h2 className="text-center text-[1.6rem] font-black uppercase tracking-[0.03em] text-[#6a4600] md:text-[1.7rem]">🥇 Ouro</h2>
              <p className="mt-2 text-center text-base font-extrabold text-[#7a5202]">Apartamento completo</p>
              <p className="mt-2 flex min-h-[56px] items-center justify-center rounded-md bg-black/70 px-3 py-1.5 text-center text-sm font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,0.22)]">Valor sugerido: {formatCurrency(vipApartmentAmountCents)}.</p>
              <Link
                href={`/contribute/vip/${campaignId}`}
                className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#8a6708] px-4 text-sm font-extrabold uppercase tracking-[0.04em] text-white transition hover:bg-[#6d5006]"
              >
                <Crown className="mr-2 h-4 w-4" aria-hidden="true" /> Ir para doador VIP
              </Link>
            </Card>
          ) : null}
        </div>

      </main>
    </div>
  );
}
