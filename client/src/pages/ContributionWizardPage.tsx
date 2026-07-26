import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertCircle, ChevronLeft, Heart, Package, Users, DollarSign, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useRoute } from "wouter";

type ContributionType = "financial" | "material" | "volunteer";
type PaymentMethod = "pix" | "card" | "boleto" | "cash";
type RecurrenceType = "unique" | "installments";
type InstallmentFrequency = "weekly" | "biweekly" | "monthly";
type DeliveryMethod = "pickup" | "deliver" | "mail" | "other";
type DeliveryFrequency = "unique" | "weekly" | "biweekly" | "monthly";
type Step = "type" | "donor-info" | "details" | "payment" | "confirmation";

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
  const [location, setLocation] = useRoute();

  const campaignQuery = trpc.campaigns.getById.useQuery(
    { id: campaignId },
    { enabled: Number.isInteger(campaignId) && campaignId > 0 },
  );

  const [step, setStep] = useState<Step>("type");
  const [state, setState] = useState<WizardState>({
    type: null,
    donorName: "",
    donorWhatsapp: "",
    donorEmail: "",
    donorCity: "",
    donorChurch: "",
    allowPublicDisplay: null,
    recurrence: "unique",
    startDate: new Date().toISOString().split("T")[0],
    materialDescription: "",
    materialQuantity: "",
    materialDeliveryFrequency: "unique",
    deliveryMethod: null,
    volunteerDescription: "",
    paymentMethod: null,
  });

  const createMaterial = trpc.contributions.createMaterialContribution.useMutation();
  const createVolunteer = trpc.contributions.createVolunteerContribution.useMutation();
  const createPayment = trpc.payments.createPaymentPreference.useMutation();

  const isValid = {
    type: state.type !== null,
    donorInfo:
      state.donorName.trim().length >= 2 &&
      state.donorWhatsapp.trim().length >= 8 &&
      state.donorCity.trim().length >= 2 &&
      state.allowPublicDisplay !== null,
    details:
      state.type === "financial"
        ? (state.amount ?? 0) >= 1 &&
          (state.recurrence === "unique" || (state.numberOfInstallments ?? 0) >= 2)
        : state.type === "material"
          ? state.materialDescription.trim().length >= 10 &&
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
    setState({ ...state, type });
    setStep("donor-info");
  };

  const handleNextStep = () => {
    if (step === "type" && isValid.type) {
      setStep("donor-info");
    } else if (step === "donor-info" && isValid.donorInfo) {
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
      if (state.type === "material") {
        await createMaterial.mutateAsync({
          campaignId,
          description: state.materialDescription,
          donorName: state.donorName,
          donorWhatsapp: state.donorWhatsapp,
          donorEmail: state.donorEmail,
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
          donorEmail: state.donorEmail,
          donorCity: state.donorCity,
          donorChurch: state.donorChurch,
          allowPublicDisplay: state.allowPublicDisplay ?? false,
        });
        toast.success("Oferta de voluntariado recebida! Entraremos em contato.");
        setLocation(`/campaigns/${campaignId}`);
      } else if (state.type === "financial" && state.amount && state.paymentMethod) {
        const result = await createPayment.mutateAsync({
          campaignId,
          amount: Math.round(state.amount * 100),
          donorName: state.donorName,
          donorWhatsapp: state.donorWhatsapp,
          donorEmail: state.donorEmail,
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
      toast.error("Erro ao processar contribuição. Tente novamente.");
    }
  };

  const campaign = campaignQuery.data;
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
            </CardHeader>
            <CardContent>
              {/* STEP 1: Tipo de Contribuição */}
              {step === "type" && (
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
                  <p className="text-sm text-gray-600 mb-6">Preencha seus dados para que possamos entrar em contato:</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
                      <Input
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
                        value={state.allowPublicDisplay === null ? "" : state.allowPublicDisplay ? "sim" : "nao"}
                        onValueChange={(value) => setState({ ...state, allowPublicDisplay: value === "sim" })}
                        disabled={loading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha uma opção..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sim">✓ Sim, pode divulgar meu nome</SelectItem>
                          <SelectItem value="nao">✕ Não, prefiro manter anônimo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setStep("type")}
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
                      Próximo →
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
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
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
                                <SelectTrigger>
                                  <SelectValue placeholder="Escolha..." />
                                </SelectTrigger>
                                <SelectContent>
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                        <Textarea
                          placeholder="Ex: Cimento, tijolos, tintas, etc."
                          value={state.materialDescription}
                          onChange={(e) => setState({ ...state, materialDescription: e.target.value })}
                          disabled={loading}
                          className="min-h-24"
                        />
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
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
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
                          <SelectTrigger>
                            <SelectValue placeholder="Escolha uma opção..." />
                          </SelectTrigger>
                          <SelectContent>
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
