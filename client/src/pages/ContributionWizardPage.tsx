import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertCircle, ChevronLeft, Heart, Package, Users, DollarSign, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Link, useLocation, useRoute } from "wouter";
import { useDonorStorage } from "@/hooks/useDonorStorage";

type ContributionType = "financial" | "material" | "volunteer";
type PaymentMethod = "pix" | "card" | "boleto" | "cash";
type RecurrenceType = "unique" | "installments";
type InstallmentFrequency = "weekly" | "biweekly" | "monthly";
type DeliveryMethod = "pickup" | "deliver" | "mail" | "other";
type DeliveryFrequency = "unique" | "weekly" | "biweekly" | "monthly";
type Step = "type" | "donor-info" | "details" | "payment" | "confirmation";

type NeedItem = {
  id: number;
  name: string;
  quantity: string | null;
  priority: "high" | "medium" | "low";
};

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

interface WizardState {
  type: ContributionType | null;
  donorName: string;
  donorWhatsapp: string;
  donorEmail: string;
  donorCity: string;
  donorChurch: string;
  allowPublicDisplay: boolean | null;
  // Financeiro
  amount?: number;
  recurrence: RecurrenceType;
  numberOfInstallments?: number;
  installmentFrequency?: InstallmentFrequency;
  startDate: string;
  // Material
  materialNeedId?: number;
  materialDescription: string;
  materialQuantity: string;
  materialDeliveryFrequency: DeliveryFrequency;
  deliveryMethod: DeliveryMethod | null;
  // Voluntário
  volunteerDescription: string;
  // Pagamento
  paymentMethod: PaymentMethod | null;
}

export default function ContributionWizardPage() {
  const [, params] = useRoute("/contribute/wizard/:id");
  const campaignId = Number(params?.id ?? 0);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Carregar dados de doadores salvos
  const { isLoaded, currentDonor, saveDonor, clearSavedDonors } = useDonorStorage();

  const campaignQuery = trpc.campaigns.getById.useQuery(
    { id: campaignId },
    { enabled: Number.isInteger(campaignId) && campaignId > 0 },
  );

  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialType = searchParams?.get("type") ?? null;
  const initialNeedId = searchParams?.get("needId") ?? null;
  const entryMode = searchParams?.get("entry") ?? null;
  const isSingleRegistrationFlow = entryMode === "needs";

  const [step, setStep] = useState<Step>("type");
  const [lastLookupKey, setLastLookupKey] = useState("");
  const [state, setState] = useState<WizardState>({
    type: null,
    donorName: "",
    donorWhatsapp: "",
    donorEmail: "",
    donorCity: "",
    donorChurch: "",
    allowPublicDisplay: false,
    recurrence: "unique",
    startDate: new Date().toISOString().split("T")[0],
    materialNeedId: undefined,
    materialDescription: "",
    materialQuantity: "",
    materialDeliveryFrequency: "unique",
    deliveryMethod: null,
    volunteerDescription: "",
    paymentMethod: null,
  });

  // Autopreencer dados salvos do doador
  useEffect(() => {
    if (isLoaded && currentDonor) {
      setState((prev) => ({
        ...prev,
        donorName: currentDonor.donorName,
        donorWhatsapp: currentDonor.donorWhatsapp,
        donorEmail: currentDonor.donorEmail,
        donorCity: currentDonor.donorCity,
        donorChurch: currentDonor.donorChurch,
      }));
    }
  }, [isLoaded, currentDonor]);

  useEffect(() => {
    if (!initialType && !initialNeedId) return;

    setState((prev) => ({
      ...prev,
      type: initialType === "financial" || initialType === "material" || initialType === "volunteer" ? initialType : prev.type,
      materialNeedId: initialNeedId ? Number(initialNeedId) : prev.materialNeedId,
    }));

    if (initialType === "material" || initialType === "financial" || initialType === "volunteer") {
      setStep("donor-info");
    }
  }, [initialType, initialNeedId]);

  useEffect(() => {
    if (step !== "donor-info") return;

    const normalizedWhatsapp = state.donorWhatsapp.replace(/\D/g, "");
    const normalizedName = state.donorName.trim().toLowerCase();
    const normalizedEmail = state.donorEmail.trim().toLowerCase();

    if (normalizedWhatsapp.length < 8 && normalizedName.length < 3 && !normalizedEmail) return;

    const lookupKey = `${normalizedWhatsapp}|${normalizedName}|${normalizedEmail}`;
    if (lookupKey === lastLookupKey) return;

    const timer = window.setTimeout(async () => {
      setLastLookupKey(lookupKey);
      let profile: Awaited<ReturnType<typeof utils.contributions.getDonorProfileLookup.fetch>> | null = null;

      try {
        profile = await utils.contributions.getDonorProfileLookup.fetch({
          donorWhatsapp: normalizedWhatsapp.length >= 8 ? state.donorWhatsapp : undefined,
          donorName: normalizedName.length >= 3 ? state.donorName : undefined,
          donorEmail: normalizedEmail || undefined,
        });
      } catch {
        profile = null;
      }

      const resolvedProfile = profile;
      if (!resolvedProfile) return;

      setState((prev) => {
        const next = {
          ...prev,
          donorName: resolvedProfile.donorName || prev.donorName,
          donorWhatsapp: resolvedProfile.donorWhatsapp || prev.donorWhatsapp,
          donorEmail: resolvedProfile.donorEmail || prev.donorEmail,
          donorCity: resolvedProfile.donorCity || prev.donorCity,
          donorChurch: resolvedProfile.donorChurch || prev.donorChurch,
          allowPublicDisplay: resolvedProfile.allowPublicDisplay ?? prev.allowPublicDisplay,
        };

        const changed =
          next.donorName !== prev.donorName
          || next.donorWhatsapp !== prev.donorWhatsapp
          || next.donorEmail !== prev.donorEmail
          || next.donorCity !== prev.donorCity
          || next.donorChurch !== prev.donorChurch
          || next.allowPublicDisplay !== prev.allowPublicDisplay;

        if (changed) {
          toast.success("Dados do doador preenchidos automaticamente.");
        }

        return next;
      });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    step,
    state.donorWhatsapp,
    state.donorName,
    utils,
    currentDonor,
    lastLookupKey,
    state.donorCity,
    state.donorChurch,
    state.donorEmail,
  ]);

  const createMaterial = trpc.contributions.createMaterialContribution.useMutation();
  const createVolunteer = trpc.contributions.createVolunteerContribution.useMutation();
  const createPayment = trpc.payments.createPaymentPreference.useMutation();

  const isValid = {
    type: state.type !== null,
    donorInfo:
      state.donorName.trim().length >= 2 &&
      state.donorWhatsapp.trim().length >= 8 &&
      state.donorCity.trim().length >= 2,
    details:
      state.type === "financial"
        ? (state.amount ?? 0) >= 1 &&
          (state.recurrence === "unique" || (state.numberOfInstallments ?? 0) >= 2)
        : state.type === "material"
          ? state.materialDescription.trim().length >= 3 &&
            state.deliveryMethod !== null &&
            (state.materialDeliveryFrequency === "unique" || state.numberOfInstallments === undefined)
          : state.volunteerDescription.trim().length >= 10,
    payment: state.paymentMethod !== null,
  };

  const donorInfoErrors = {
    name: state.donorName.trim().length < 2 ? "Nome deve ter pelo menos 2 caracteres" : "",
    whatsapp: state.donorWhatsapp.trim().length < 8 ? "WhatsApp deve ter pelo menos 8 caracteres" : "",
    city: state.donorCity.trim().length < 2 ? "Cidade deve ter pelo menos 2 caracteres" : "",
  };

  const handleTypeSelect = (type: ContributionType) => {
    setState({
      ...state,
      type,
      deliveryMethod: type === "material" ? (state.deliveryMethod ?? "pickup") : state.deliveryMethod,
    });
    setStep("donor-info");
  };

  const handleNextStep = () => {
    if (step === "type" && isValid.type) {
      setStep("donor-info");
    } else if (step === "donor-info" && isValid.donorInfo) {
      if (isSingleRegistrationFlow && state.type === null) {
        saveDonor({
          donorName: state.donorName,
          donorWhatsapp: state.donorWhatsapp,
          donorEmail: state.donorEmail,
          donorCity: state.donorCity,
          donorChurch: state.donorChurch,
        });
        toast.success("Cadastro único concluído. Agora escolha como ajudar na lista.");
        setLocation(`/contribute/items/${campaignId}`);
        return;
      }
      setStep("details");
    } else if (step === "details" && isValid.details) {
      if (state.type === "financial") {
        setStep("payment");
      } else {
        handleSubmit();
      }
    } else if (step === "payment" && isValid.payment) {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    try {
      // Salvar dados do doador para próximas doações
      const donor = saveDonor({
        donorName: state.donorName,
        donorWhatsapp: state.donorWhatsapp,
        donorEmail: state.donorEmail,
        donorCity: state.donorCity,
        donorChurch: state.donorChurch,
      });

      if (state.type === "material") {
        await createMaterial.mutateAsync({
          campaignId,
          campaignNeedId: state.materialNeedId,
          description: state.materialDescription,
          donorName: state.donorName,
          donorWhatsapp: state.donorWhatsapp,
          donorEmail: state.donorEmail.trim() ? state.donorEmail.trim() : undefined,
          donorCity: state.donorCity,
          donorChurch: state.donorChurch,
          allowPublicDisplay: state.allowPublicDisplay ?? false,
          quantity: state.materialQuantity || undefined,
          deliveryMethod: state.deliveryMethod || undefined,
          numberOfInstallments: state.materialDeliveryFrequency === "unique" ? undefined : state.numberOfInstallments,
          materialDeliveryFrequency: state.materialDeliveryFrequency,
        });
        toast.success("Oferta de material recebida! Entraremos em contato.");
        setLocation(`/campaigns/${campaignId}`);
      } else if (state.type === "volunteer") {
        await createVolunteer.mutateAsync({
          campaignId,
          description: state.volunteerDescription,
          donorName: state.donorName,
          donorWhatsapp: state.donorWhatsapp,
          donorEmail: state.donorEmail.trim() ? state.donorEmail.trim() : undefined,
          donorCity: state.donorCity,
          donorChurch: state.donorChurch,
          allowPublicDisplay: state.allowPublicDisplay ?? false,
        });
        toast.success("Oferta de voluntariado recebida! Entraremos em contato.");
        setLocation(`/campaigns/${campaignId}`);
      } else if (state.type === "financial" && state.amount && state.paymentMethod) {
        const result = await createPayment.mutateAsync({
          campaignId,
          campaignTitle: campaign?.title,
          amount: Math.round(state.amount * 100),
          paymentMethod: state.paymentMethod,
          donorName: state.donorName,
          donorWhatsapp: state.donorWhatsapp,
          donorEmail: state.donorEmail.trim(),
          donorCity: state.donorCity,
          donorChurch: state.donorChurch,
          allowPublicDisplay: state.allowPublicDisplay ?? false,
          numberOfInstallments: state.recurrence === "installments" ? state.numberOfInstallments : undefined,
          installmentFrequency: state.recurrence === "installments" ? state.installmentFrequency : undefined,
        });
        if (result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
        }
      }
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : "Erro ao processar contribuição. Tente novamente.";
      toast.error(message);
    }
  };

  const campaign = campaignQuery.data;
  const campaignNeeds = sortNeeds((campaign?.needs ?? []) as NeedItem[]);
  const loading = createMaterial.isPending || createVolunteer.isPending || createPayment.isPending;

  return (
    <>
      <PublicHeader />
      <main className="min-h-screen bg-gradient-to-b from-[#f8faf6] to-white">
        <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
          <Link href={`/campaigns/${campaignId}`} className="mb-6 flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </Link>

          <Card>
            <CardHeader>
              <CardTitle>Como você gostaria de contribuir?</CardTitle>
              {campaign && <CardDescription>Campanha: {campaign.title}</CardDescription>}
              
              {/* Progress Indicator */}
              <div className="mt-6 flex items-center justify-between">
                {isSingleRegistrationFlow && state.type === null ? (
                  <>
                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "donor-info" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>1</div>
                      <span className={`text-xs font-medium ${step === "donor-info" ? "text-blue-600" : "text-gray-600"}`}>Cadastro</span>
                    </div>
                  </>
                ) : state.type === "financial" ? (
                  <>
                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "type" || step === "donor-info" || step === "details" || step === "payment" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>1</div>
                      <span className={`text-xs font-medium ${step === "type" ? "text-blue-600" : "text-gray-600"}`}>Tipo</span>
                    </div>
                    <div className={`flex-1 h-1 mx-2 ${step === "donor-info" || step === "details" || step === "payment" ? "bg-blue-600" : "bg-gray-200"}`} />
                    
                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "donor-info" || step === "details" || step === "payment" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>2</div>
                      <span className={`text-xs font-medium ${step === "donor-info" ? "text-blue-600" : "text-gray-600"}`}>Doador</span>
                    </div>
                    <div className={`flex-1 h-1 mx-2 ${step === "details" || step === "payment" ? "bg-blue-600" : "bg-gray-200"}`} />
                    
                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "details" || step === "payment" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>3</div>
                      <span className={`text-xs font-medium ${step === "details" ? "text-blue-600" : "text-gray-600"}`}>Detalhes</span>
                    </div>
                    <div className={`flex-1 h-1 mx-2 ${step === "payment" ? "bg-blue-600" : "bg-gray-200"}`} />
                    
                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "payment" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>4</div>
                      <span className={`text-xs font-medium ${step === "payment" ? "text-blue-600" : "text-gray-600"}`}>Pagamento</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "type" || step === "donor-info" || step === "details" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>1</div>
                      <span className={`text-xs font-medium ${step === "type" ? "text-blue-600" : "text-gray-600"}`}>Tipo</span>
                    </div>
                    <div className={`flex-1 h-1 mx-2 ${step === "donor-info" || step === "details" ? "bg-blue-600" : "bg-gray-200"}`} />
                    
                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "donor-info" || step === "details" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>2</div>
                      <span className={`text-xs font-medium ${step === "donor-info" ? "text-blue-600" : "text-gray-600"}`}>Doador</span>
                    </div>
                    <div className={`flex-1 h-1 mx-2 ${step === "details" ? "bg-blue-600" : "bg-gray-200"}`} />
                    
                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "details" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>3</div>
                      <span className={`text-xs font-medium ${step === "details" ? "text-blue-600" : "text-gray-600"}`}>Detalhes</span>
                    </div>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {campaignNeeds.length > 0 && (
                <div className="mb-6 rounded-lg border border-[#d5dfd3] bg-[#f5f8f4] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#35523a]">De acordo com a lista da campanha</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {campaignNeeds.map((need) => (
                      <div key={need.id} className="rounded-md border border-[#e1e8df] bg-white px-3 py-2 text-sm">
                        <span className="font-semibold text-[#2d2d2d]">{normalizeNeedLabel(need.name)}</span>
                        <span className="text-[#5f6f61]">: {need.quantity || "A DEFINIR"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 1: Tipo de Contribuição */}
              {step === "type" && !isSingleRegistrationFlow && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 mb-6">Escolha o tipo de ajuda que você deseja oferecer:</p>
                  <div className="grid gap-3">
                    <button
                      onClick={() => handleTypeSelect("financial")}
                      className="flex items-start gap-4 rounded-lg border-2 border-gray-200 p-4 text-left transition hover:border-blue-500 hover:bg-blue-50"
                    >
                      <DollarSign className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold text-gray-900">💰 Doação Financeira</h3>
                        <p className="text-sm text-gray-600">PIX, cartão, boleto ou dinheiro</p>
                      </div>
                    </button>

                    <button
                      onClick={() => handleTypeSelect("material")}
                      className="flex items-start gap-4 rounded-lg border-2 border-gray-200 p-4 text-left transition hover:border-green-500 hover:bg-green-50"
                    >
                      <Package className="h-6 w-6 text-green-600 flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold text-gray-900">📦 Doação de Material</h3>
                        <p className="text-sm text-gray-600">Materiais de construção, alimentos, etc.</p>
                      </div>
                    </button>

                    <button
                      onClick={() => handleTypeSelect("volunteer")}
                      className="flex items-start gap-4 rounded-lg border-2 border-gray-200 p-4 text-left transition hover:border-purple-500 hover:bg-purple-50"
                    >
                      <Users className="h-6 w-6 text-purple-600 flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold text-gray-900">🤝 Mão de Obra / Voluntariado</h3>
                        <p className="text-sm text-gray-600">Serviços, profissões ou trabalho voluntário</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Dados do Doador */}
              {step === "donor-info" && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 mb-6">
                    {isSingleRegistrationFlow && state.type === null
                      ? "Faça seu cadastro único para liberar a lista de materiais e a opção de doação em dinheiro."
                      : "Preencha seus dados para que possamos entrar em contato:"}
                  </p>
                  
                  {currentDonor && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-blue-700">
                        <span className="font-semibold">✓ Bem-vindo novamente!</span> Seus dados foram carregados automaticamente.
                        <br />
                        <span className="text-xs text-blue-600 mt-1 block">ID do doador: {currentDonor.donorId} • Doações anteriores: {currentDonor.donationsCount}</span>
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-2 h-auto p-0 text-sm font-semibold text-blue-700 hover:text-blue-800"
                        onClick={() => {
                          clearSavedDonors();
                          setLastLookupKey("");
                          setState((prev) => ({
                            ...prev,
                            donorName: "",
                            donorWhatsapp: "",
                            donorEmail: "",
                            donorCity: "",
                            donorChurch: "",
                          }));
                          toast.success("Dados salvos deste dispositivo foram apagados.");
                        }}
                      >
                        Esquecer meus dados neste dispositivo
                      </Button>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
                      <Input
                        autoComplete="off"
                        placeholder="Seu nome"
                        value={state.donorName}
                        onChange={(e) => setState({ ...state, donorName: e.target.value })}
                        disabled={loading}
                        className={donorInfoErrors.name ? "border-red-500" : ""}
                      />
                      {donorInfoErrors.name && <p className="text-xs text-red-500 mt-1">{donorInfoErrors.name}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
                      <Input
                        autoComplete="off"
                        placeholder="(11) 99999-9999"
                        value={state.donorWhatsapp}
                        onChange={(e) => setState({ ...state, donorWhatsapp: e.target.value })}
                        disabled={loading}
                        className={donorInfoErrors.whatsapp ? "border-red-500" : ""}
                      />
                      {donorInfoErrors.whatsapp && <p className="text-xs text-red-500 mt-1">{donorInfoErrors.whatsapp}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email (opcional)</label>
                      <Input
                        autoComplete="off"
                        type="email"
                        placeholder="seu@email.com"
                        value={state.donorEmail}
                        onChange={(e) => setState({ ...state, donorEmail: e.target.value })}
                        disabled={loading}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cidade *</label>
                        <Input
                          autoComplete="off"
                          placeholder="Sua cidade"
                          value={state.donorCity}
                          onChange={(e) => setState({ ...state, donorCity: e.target.value })}
                          disabled={loading}
                          className={donorInfoErrors.city ? "border-red-500" : ""}
                        />
                        {donorInfoErrors.city && <p className="text-xs text-red-500 mt-1">{donorInfoErrors.city}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Igreja (opcional)</label>
                        <Input
                          autoComplete="off"
                          placeholder="Nome da sua igreja"
                          value={state.donorChurch}
                          onChange={(e) => setState({ ...state, donorChurch: e.target.value })}
                          disabled={loading}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Posso divulgar seu nome? *</label>
                      <Select
                        value={state.allowPublicDisplay ? "sim" : "nao"}
                        onValueChange={(value) => setState({ ...state, allowPublicDisplay: value === "sim" })}
                        disabled={loading}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Escolha uma opção..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-gray-200 shadow-lg">
                          <SelectItem value="sim">✓ Sim, pode divulgar meu nome</SelectItem>
                          <SelectItem value="nao">✕ Não, prefiro manter anônimo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (isSingleRegistrationFlow && state.type === null) {
                          setLocation(`/campaign/${campaignId}`);
                          return;
                        }
                        setStep("type");
                      }}
                      disabled={loading}
                      className="flex-1"
                    >
                      ← Voltar
                    </Button>
                    <Button
                      onClick={handleNextStep}
                      disabled={!isValid.donorInfo || loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      {isSingleRegistrationFlow && state.type === null ? "Ir para lista de itens →" : "Próximo →"}
                    </Button>
                  </div>
                </div>
              )}

              {/* STEP 3: Detalhes da Contribuição */}
              {step === "details" && (
                <div className="space-y-4">
                  {state.type === "financial" && (
                    <>
                      <p className="text-sm text-gray-600 mb-6">Defina os detalhes de sua doação financeira:</p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                        <Input
                          type="number"
                          placeholder="100,00"
                          step="0.01"
                          min="1"
                          value={state.amount || ""}
                          onChange={(e) => setState({ ...state, amount: e.target.value ? parseFloat(e.target.value) : undefined })}
                          disabled={loading}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Como você gostaria de pagar? *</label>
                        <Select
                          value={state.recurrence}
                          onValueChange={(value) => setState({ ...state, recurrence: value as RecurrenceType, numberOfInstallments: undefined })}
                          disabled={loading}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border border-gray-200 shadow-lg">
                            <SelectItem value="unique">À vista (uma vez)</SelectItem>
                            <SelectItem value="installments">Em parcelas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {state.recurrence === "installments" && (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Número de Parcelas *</label>
                              <Input
                                type="number"
                                placeholder="Ex: 10"
                                min="2"
                                max="24"
                                value={state.numberOfInstallments || ""}
                                onChange={(e) => setState({ ...state, numberOfInstallments: e.target.value ? parseInt(e.target.value) : undefined })}
                                disabled={loading}
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Frequência *</label>
                              <Select
                                value={state.installmentFrequency || ""}
                                onValueChange={(value) => setState({ ...state, installmentFrequency: value as InstallmentFrequency })}
                                disabled={loading}
                              >
                                <SelectTrigger className="bg-white">
                                  <SelectValue placeholder="Escolha..." />
                                </SelectTrigger>
                                <SelectContent className="bg-white border border-gray-200 shadow-lg">
                                  <SelectItem value="weekly">Semanal</SelectItem>
                                  <SelectItem value="biweekly">Quinzenal</SelectItem>
                                  <SelectItem value="monthly">Mensal</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Início *</label>
                        <Input
                          type="date"
                          value={state.startDate}
                          onChange={(e) => setState({ ...state, startDate: e.target.value })}
                          disabled={loading}
                        />
                      </div>
                    </>
                  )}

                  {state.type === "material" && (
                    <>
                      <p className="text-sm text-gray-600 mb-6">Descreva o material que você gostaria de doar:</p>
                      {campaignNeeds.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Item da lista (opcional)</label>
                          <Select
                            value={state.materialNeedId ? String(state.materialNeedId) : ""}
                            onValueChange={(value) => setState({ ...state, materialNeedId: value ? Number(value) : undefined })}
                            disabled={loading}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="Escolha um item da lista" />
                            </SelectTrigger>
                            <SelectContent className="bg-white border border-gray-200 shadow-lg">
                              {campaignNeeds.map((need) => (
                                <SelectItem key={need.id} value={String(need.id)}>
                                  {need.name}{need.quantity ? `: ${need.quantity}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                        <Textarea
                          placeholder="Ex: Cimento, tijolos, tintas, etc."
                          value={state.materialDescription}
                          onChange={(e) => setState({ ...state, materialDescription: e.target.value })}
                          disabled={loading}
                          className="min-h-24"
                        />
                        <p className="mt-1 text-xs text-gray-500">Mínimo de 3 caracteres.</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade (opcional)</label>
                        <Input
                          placeholder="Ex: 100 unidades, 5 caixas, etc."
                          value={state.materialQuantity}
                          onChange={(e) => setState({ ...state, materialQuantity: e.target.value })}
                          disabled={loading}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Como você gostaria de entregar? *</label>
                        <Select
                          value={state.materialDeliveryFrequency}
                          onValueChange={(value) => setState({ ...state, materialDeliveryFrequency: value as DeliveryFrequency })}
                          disabled={loading}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border border-gray-200 shadow-lg">
                            <SelectItem value="unique">Tudo de uma vez</SelectItem>
                            <SelectItem value="weekly">Semanalmente</SelectItem>
                            <SelectItem value="biweekly">Quinzenalmente</SelectItem>
                            <SelectItem value="monthly">Mensalmente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Como fazer a doação? *</label>
                        <Select
                          value={state.deliveryMethod || ""}
                          onValueChange={(value) => setState({ ...state, deliveryMethod: value as DeliveryMethod })}
                          disabled={loading}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Escolha uma opção..." />
                          </SelectTrigger>
                          <SelectContent className="bg-white border border-gray-200 shadow-lg">
                            <SelectItem value="pickup">📍 Entrega pessoalmente no local da obra</SelectItem>
                            <SelectItem value="deliver">🚚 Buscar na minha casa/local</SelectItem>
                            <SelectItem value="mail">📦 Enviar pelo correio</SelectItem>
                            <SelectItem value="other">📞 Outro (combinar por whatsapp)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {state.type === "volunteer" && (
                    <>
                      <p className="text-sm text-gray-600 mb-6">Descreva o tipo de mão de obra ou voluntariado que você oferece:</p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                        <Textarea
                          placeholder="Ex: Pedreiro, eletricista, pintor, ajudante, etc."
                          value={state.volunteerDescription}
                          onChange={(e) => setState({ ...state, volunteerDescription: e.target.value })}
                          disabled={loading}
                          className="min-h-24"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setStep("donor-info")}
                      disabled={loading}
                      className="flex-1"
                    >
                      ← Voltar
                    </Button>
                    <Button
                      onClick={handleNextStep}
                      disabled={!isValid.details || loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      {state.type === "financial" ? "Escolher Pagamento →" : "Enviar →"}
                    </Button>
                  </div>
                </div>
              )}

              {/* STEP 4: Forma de Pagamento (apenas para financeiro) */}
              {step === "payment" && state.type === "financial" && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 mb-6">Escolha a forma de pagamento:</p>
                  <div className="grid gap-3">
                    <button
                      onClick={() => setState({ ...state, paymentMethod: "pix" })}
                      className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition ${
                        state.paymentMethod === "pix"
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-blue-500"
                      }`}
                      disabled={loading}
                    >
                      <div className={`h-5 w-5 rounded-full border-2 ${state.paymentMethod === "pix" ? "border-blue-500 bg-blue-500" : "border-gray-300"}`} />
                      <span className="font-medium">🔗 PIX (cópia e cola)</span>
                    </button>

                    <button
                      onClick={() => setState({ ...state, paymentMethod: "card" })}
                      className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition ${
                        state.paymentMethod === "card"
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-blue-500"
                      }`}
                      disabled={loading}
                    >
                      <div className={`h-5 w-5 rounded-full border-2 ${state.paymentMethod === "card" ? "border-blue-500 bg-blue-500" : "border-gray-300"}`} />
                      <span className="font-medium">💳 Cartão de Crédito/Débito</span>
                    </button>

                    <button
                      onClick={() => setState({ ...state, paymentMethod: "boleto" })}
                      className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition ${
                        state.paymentMethod === "boleto"
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-blue-500"
                      }`}
                      disabled={loading}
                    >
                      <div className={`h-5 w-5 rounded-full border-2 ${state.paymentMethod === "boleto" ? "border-blue-500 bg-blue-500" : "border-gray-300"}`} />
                      <span className="font-medium">🧾 Boleto Bancário</span>
                    </button>

                    <button
                      onClick={() => setState({ ...state, paymentMethod: "cash" })}
                      className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition ${
                        state.paymentMethod === "cash"
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-blue-500"
                      }`}
                      disabled={loading}
                    >
                      <div className={`h-5 w-5 rounded-full border-2 ${state.paymentMethod === "cash" ? "border-blue-500 bg-blue-500" : "border-gray-300"}`} />
                      <span className="font-medium">💵 Dinheiro (presencial)</span>
                    </button>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setStep("details")}
                      disabled={loading}
                      className="flex-1"
                    >
                      ← Voltar
                    </Button>
                    <Button
                      onClick={handleNextStep}
                      disabled={!isValid.payment || loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      {loading ? "Processando..." : "Confirmar Doação →"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
