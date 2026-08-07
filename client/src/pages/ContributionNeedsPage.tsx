import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { readLocalNeedProgressForCampaign, readLocalNeedsForCampaign } from "@/lib/localNeeds";
import { buildPublicNeedsList } from "@/lib/publicNeeds";
import { useDonorStorage } from "@/hooks/useDonorStorage";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { toast } from "sonner";

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

type SelectedNeed = {
  needId: number;
  needName: string;
  quantityExact: number;
  unitValueCents: number;
};

const formatCurrency = (valueInCents: number) =>
  (valueInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PREFERRED_KEYWORDS = ["TIJOLO", "CIMENTO", "AREIA", "JANELA"];
const NEEDS_PER_PAGE = 8;

const LOCAL_NEEDS_FALLBACK: NeedItem[] = [];

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
  const [, setLocation] = useLocation();
  const { isLoaded, currentDonor } = useDonorStorage();
  const [materialQuantities, setMaterialQuantities] = useState<Record<number, string>>({});
  const [selectedNeeds, setSelectedNeeds] = useState<Record<number, SelectedNeed>>({});
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [, setRefreshVersion] = useState(0);
  const createMaterial = trpc.contributions.createMaterialContribution.useMutation();

  const campaignQuery = trpc.campaigns.getById.useQuery(
    { id: campaignId },
    { enabled: Number.isInteger(campaignId) && campaignId > 0 },
  );

  const campaign = campaignQuery.data;
  const isLocalhost = typeof window !== "undefined" && /localhost|127\.0\.0\.1/i.test(window.location.hostname);
  const vipApartmentAmountCents = (campaign && "vipApartmentAmountCents" in campaign && typeof campaign.vipApartmentAmountCents === "number")
    ? campaign.vipApartmentAmountCents
    : 120_000_00;
  const needsFromCampaign = sortNeeds((campaign?.needs ?? []) as NeedItem[]);
  const localNeeds = isLocalhost ? sortNeeds(readLocalNeedsForCampaign(campaignId) as NeedItem[]) : [];
  const localNeedProgress = readLocalNeedProgressForCampaign(campaignId);
  const needsFromAllSources = sortNeeds(buildPublicNeedsList(needsFromCampaign, localNeedProgress, localNeeds) as NeedItem[]);
  const needs = needsFromAllSources.length > 0 ? needsFromAllSources : LOCAL_NEEDS_FALLBACK;
  const hasSingleRegistration = isLoaded && !!currentDonor;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(needs.length / NEEDS_PER_PAGE));
  const pageStart = (currentPage - 1) * NEEDS_PER_PAGE;
  const pagedNeeds = needs.slice(pageStart, pageStart + NEEDS_PER_PAGE);
  const selectedNeedEntries = Object.values(selectedNeeds);
  const selectedTotalEstimatedCents = selectedNeedEntries.reduce(
    (sum, item) => sum + item.quantityExact * item.unitValueCents,
    0,
  );

  const handleAddSelectedNeed = (need: NeedItem, quantityExact: number) => {
    const unitValueCents = need.unitValueCents ?? 0;
    setSelectedNeeds((prev) => ({
      ...prev,
      [need.id]: {
        needId: need.id,
        needName: need.name,
        quantityExact,
        unitValueCents,
      },
    }));
  };

  const handleRemoveSelectedNeed = (needId: number) => {
    setSelectedNeeds((prev) => {
      const next = { ...prev };
      delete next[needId];
      return next;
    });
  };

  const handleSubmitSelectedNeeds = async () => {
    if (!hasSingleRegistration || !currentDonor) {
      setLocation(`/contribute/wizard/${campaignId}?entry=needs`);
      return;
    }

    const items = Object.values(selectedNeeds);
    if (!items.length) {
      toast.error("Selecione pelo menos um item para confirmar.");
      return;
    }

    setIsSubmittingBatch(true);
    const failedIds = new Set<number>();
    let successCount = 0;

    for (const item of items) {
      try {
        await createMaterial.mutateAsync({
          campaignId,
          campaignNeedId: item.needId,
          description: `DOACAO DETALHADA | ${normalizeNeedLabel(item.needName)}`,
          donorName: currentDonor.donorName,
          donorCpf: currentDonor.donorCpf,
          donorWhatsapp: currentDonor.donorWhatsapp,
          donorEmail: currentDonor.donorEmail,
          donorCity: currentDonor.donorCity,
          donorChurch: currentDonor.donorChurch,
          quantity: String(item.quantityExact),
          quantityExact: item.quantityExact,
          deliveryMethod: "pickup",
          materialDeliveryFrequency: "unique",
          allowPublicDisplay: false,
        });
        successCount += 1;
      } catch {
        failedIds.add(item.needId);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} item(ns) de material enviado(s) para triagem.`);
    }

    if (failedIds.size > 0) {
      toast.error(`${failedIds.size} item(ns) falharam. Revise e tente novamente.`);
    }

    setSelectedNeeds((prev) => {
      const next = { ...prev };
      for (const item of items) {
        if (!failedIds.has(item.needId)) {
          delete next[item.needId];
        }
      }
      return next;
    });

    setMaterialQuantities((prev) => {
      const next = { ...prev };
      for (const item of items) {
        if (!failedIds.has(item.needId)) {
          delete next[item.needId];
        }
      }
      return next;
    });

    await campaignQuery.refetch();
    setIsSubmittingBatch(false);
  };

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    const refreshFromStorage = () => setRefreshVersion((value) => value + 1);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshFromStorage();
      }
    };

    window.addEventListener("storage", refreshFromStorage);
    window.addEventListener("focus", refreshFromStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("storage", refreshFromStorage);
      window.removeEventListener("focus", refreshFromStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

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

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <main className="container max-w-5xl px-4 py-6 md:py-8">
        <Link href={`/campaign/${campaignId}`} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#4f6550] hover:text-[#228B22]">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar à campanha
        </Link>

        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">{campaign.title}</p>
          <h1 className="mt-2 text-3xl font-bold text-[#2d2d2d] md:text-4xl">Doação de materiais</h1>
          <p className="mx-auto mt-3 max-w-3xl text-[#656565]">Esta página é exclusiva para itens e quantidades da campanha.</p>
        </div>

        {!hasSingleRegistration && (
          <Card className="mt-6 border-[#dbe7d8] bg-[#f5faf4] p-5">
            <p className="text-sm font-semibold text-[#2d2d2d]">Cadastro único somente para doação por item</p>
            <p className="mt-1 text-sm text-[#5b655c]">
              Você só precisa de cadastro para informar quantidades de materiais da planilha.
              Outras formas de ajuda ficam em uma página separada para não misturar os fluxos.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/contribute/wizard/${campaignId}?entry=needs`}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#228B22] px-4 font-semibold text-white transition hover:bg-[#1b711b]"
              >
                Fazer cadastro único
              </Link>
              <Link
                href={`/contribute/help/${campaignId}`}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#1f3d2b] px-4 font-semibold text-[#1f3d2b] transition hover:bg-[#1f3d2b]/5"
              >
                Ver outras formas de ajuda
              </Link>
            </div>
          </Card>
        )}

        <Card id="doacao-por-itens" className="mt-7 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#eef3ec] text-[#2d2d2d]">
                <tr>
                  <th className="px-4 py-3 font-semibold">ITEM</th>
                  <th className="px-4 py-3 font-semibold">META</th>
                  <th className="px-4 py-3 font-semibold">VALOR UNITÁRIO</th>
                  <th className="px-4 py-3 font-semibold">VALOR TOTAL DA META</th>
                  <th className="px-4 py-3 font-semibold">MINHA DOAÇÃO</th>
                  <th className="px-4 py-3 font-semibold">FALTAM</th>
                </tr>
              </thead>
              <tbody>
                {needs.length > 0 ? pagedNeeds.map((need) => {
                  const targetQuantity = need.targetQuantityExact ?? 0;
                  const unitValueCents = need.unitValueCents ?? 0;
                  const remainingQuantity = need.remainingQuantity ?? Math.max(0, targetQuantity - (need.offeredQuantity ?? 0));
                  const totalTargetValueCents = targetQuantity * unitValueCents;
                  const materialQuantity = materialQuantities[need.id] ?? "";
                  const materialQuantityExact = Number.parseInt(materialQuantity, 10);
                  const hasValidQuantity = Number.isFinite(materialQuantityExact) && materialQuantityExact > 0;
                  const donatedValueCents = hasValidQuantity ? materialQuantityExact * unitValueCents : 0;
                  const remainingAfterDonation = hasValidQuantity
                    ? Math.max(0, remainingQuantity - materialQuantityExact)
                    : remainingQuantity;
                  const exceedsRemaining = hasValidQuantity && materialQuantityExact > remainingQuantity;
                  const isMetaAtingida = remainingQuantity <= 0;

                  return (
                  <tr key={need.id} className="border-t border-[#e2e9df] align-top">
                    <td className="px-3 py-2 font-semibold text-[#2d2d2d]">{normalizeNeedLabel(need.name)}</td>
                    <td className="px-3 py-2 text-[#4d5e4f]">{targetQuantity}</td>
                    <td className="px-3 py-2 text-[#4d5e4f]">{formatCurrency(unitValueCents)}</td>
                    <td className="px-3 py-2 text-[#4d5e4f] font-medium">{formatCurrency(totalTargetValueCents)}</td>
                    <td className="px-3 py-2">
                      {hasSingleRegistration ? (
                        <div className="space-y-1">
                          <div className="flex items-end gap-2">
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              placeholder="Qtd"
                              value={materialQuantity}
                              onChange={(event) => {
                                const value = event.target.value;
                                setMaterialQuantities((prev) => ({ ...prev, [need.id]: value }));
                              }}
                              className="h-9 w-20"
                              disabled={isMetaAtingida}
                            />
                            <Button
                              type="button"
                              className="h-9 bg-[#1f3d2b] px-3 text-xs font-semibold text-white hover:bg-[#163021]"
                              disabled={!hasValidQuantity || exceedsRemaining || isMetaAtingida || isSubmittingBatch}
                              onClick={() => {
                                if (!hasValidQuantity || exceedsRemaining || isMetaAtingida) return;
                                handleAddSelectedNeed(need, materialQuantityExact);
                              }}
                            >
                              {selectedNeeds[need.id] ? "Atualizar" : "Adicionar"}
                            </Button>
                            {selectedNeeds[need.id] && (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-9 px-3 text-xs"
                                disabled={isSubmittingBatch}
                                onClick={() => handleRemoveSelectedNeed(need.id)}
                              >
                                Remover
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-[#5b655c]">Valor: {formatCurrency(donatedValueCents)}</p>
                          {selectedNeeds[need.id] && (
                            <p className="text-xs font-semibold text-[#1f3d2b]">Selecionado: {selectedNeeds[need.id].quantityExact}</p>
                          )}
                          {exceedsRemaining && (
                            <p className="text-xs font-semibold text-red-600">Quantidade acima do saldo disponível.</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-[#5b655c]">Cadastro único para itens</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#4d5e4f]">
                      <div>{remainingQuantity}</div>
                      {hasSingleRegistration && hasValidQuantity && (
                        <div className="text-xs text-[#6f7e71]">Após confirmar: {remainingAfterDonation}</div>
                      )}
                      {isMetaAtingida && (
                        <div className="mt-1 space-y-1">
                          <div className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
                            META PROJETADA
                          </div>
                          <p className="text-[11px] font-medium text-[#5b655c]">Item travado temporariamente ate validacao da administracao ou confirmacao do pagamento.</p>
                        </div>
                      )}
                    </td>
                  </tr>
                )}) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#656565]">
                      <p className="font-semibold text-[#2d2d2d]">Ainda não há itens cadastrados para esta campanha.</p>
                      <p className="mt-1 text-sm">Quando o administrador incluir itens, eles aparecem aqui automaticamente.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {needs.length > NEEDS_PER_PAGE && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2e9df] px-4 py-3">
              <p className="text-xs text-[#5b655c]">
                Mostrando {pageStart + 1}-{Math.min(pageStart + NEEDS_PER_PAGE, needs.length)} de {needs.length} itens
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                >
                  Anterior
                </Button>
                <span className="text-xs font-semibold text-[#2d2d2d]">Página {currentPage} de {totalPages}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>

        {hasSingleRegistration && (
          <Card className="mt-6 border-[#dbe7d8] bg-[#f9fcf8] p-5">
            <p className="text-sm font-semibold text-[#2d2d2d]">Itens selecionados para doar</p>
            {selectedNeedEntries.length > 0 ? (
              <>
                <div className="mt-3 space-y-2">
                  {selectedNeedEntries.map((item) => (
                    <div key={item.needId} className="flex items-center justify-between rounded-md border border-[#e2e9df] bg-white px-3 py-2 text-sm">
                      <span className="font-medium text-[#2d2d2d]">{normalizeNeedLabel(item.needName)} x {item.quantityExact}</span>
                      <span className="text-[#4d5e4f]">{formatCurrency(item.quantityExact * item.unitValueCents)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm font-semibold text-[#1f3d2b]">Total estimado: {formatCurrency(selectedTotalEstimatedCents)}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="bg-[#228B22] text-white hover:bg-[#1b711b]"
                    disabled={isSubmittingBatch}
                    onClick={handleSubmitSelectedNeeds}
                  >
                    {isSubmittingBatch ? "Enviando itens..." : "Confirmar itens e enviar para validação"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmittingBatch}
                    onClick={() => setSelectedNeeds({})}
                  >
                    Limpar seleção
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-[#5b655c]">Adicione os itens da tabela e confirme tudo de uma vez.</p>
            )}
          </Card>
        )}

        <Card className="mt-6 border-[#dbe7d8] bg-white p-5">
          <p className="text-sm font-semibold text-[#2d2d2d]">Quer ajudar de outra forma?</p>
          <p className="mt-1 text-sm text-[#5b655c]">As outras modalidades ficam em página separada para não misturar com itens.</p>
          <Link
            href={`/contribute/help/${campaignId}`}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-[#1f3d2b] px-4 font-semibold text-[#1f3d2b] transition hover:bg-[#1f3d2b]/5"
          >
            Ir para página de escolha
          </Link>
        </Card>
      </main>
    </div>
  );
}
