import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChevronLeft, AlertCircle, Loader2, LockKeyhole } from "lucide-react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useDonorStorage } from "@/hooks/useDonorStorage";

export default function CheckoutPage() {
  const [match, params] = useRoute("/checkout/:campaignId");
  const campaignId = parseInt(params?.campaignId || "0");

  const [amount, setAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorCpf, setDonorCpf] = useState("");
  const [donorWhatsapp, setDonorWhatsapp] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [donorCity, setDonorCity] = useState("");
  const [donorChurch, setDonorChurch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card" | "boleto" | "cash">("pix");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastLookupKey, setLastLookupKey] = useState("");
  const { currentDonor, isLoaded, saveDonor, clearSavedDonors, findDonorByCpf, findDonorByName, findDonorByWhatsapp } = useDonorStorage();

  function parseBrlAmount(value: string) {
    const normalized = value.trim().replace(/\s+/g, "");
    if (!normalized) return NaN;

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      return Number(normalized.replace(/\./g, "").replace(",", "."));
    }

    if (hasComma) {
      return Number(normalized.replace(",", "."));
    }

    return Number(normalized.replace(/\./g, ""));
  }

  const handleForgetSavedDonor = () => {
    clearSavedDonors();
    setDonorName("");
    setDonorCpf("");
    setDonorWhatsapp("");
    setDonorEmail("");
    setDonorCity("");
    setDonorChurch("");
    toast.success("Dados salvos deste dispositivo foram apagados.");
  };

  useEffect(() => {
    if (!isLoaded || !currentDonor) return;
    setDonorName((current) => current || currentDonor.donorName || "");
    setDonorCpf((current) => current || currentDonor.donorCpf || "");
    setDonorWhatsapp((current) => current || currentDonor.donorWhatsapp || "");
    setDonorEmail((current) => current || currentDonor.donorEmail || "");
    setDonorCity((current) => current || currentDonor.donorCity || "");
    setDonorChurch((current) => current || currentDonor.donorChurch || "");
  }, [currentDonor, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    const normalizedCpf = donorCpf.replace(/\D/g, "");
    const normalizedWhatsapp = donorWhatsapp.replace(/\D/g, "");
    const normalizedName = donorName.trim().toLowerCase();
    const lookupKey = `${normalizedCpf}|${normalizedWhatsapp}|${normalizedName}`;
    if (lookupKey === lastLookupKey) return;

    const matchedDonor = findDonorByCpf(normalizedCpf)
      ?? findDonorByWhatsapp(normalizedWhatsapp)
      ?? findDonorByName(donorName);

    if (!matchedDonor) return;

    setLastLookupKey(lookupKey);
    setDonorName((current) => current || matchedDonor.donorName || "");
    setDonorCpf((current) => current || matchedDonor.donorCpf || "");
    setDonorWhatsapp((current) => current || matchedDonor.donorWhatsapp || "");
    setDonorEmail((current) => current || matchedDonor.donorEmail || "");
    setDonorCity((current) => current || matchedDonor.donorCity || "");
    setDonorChurch((current) => current || matchedDonor.donorChurch || "");
  }, [currentDonor, donorCpf, donorWhatsapp, donorName, isLoaded, lastLookupKey, findDonorByCpf, findDonorByName, findDonorByWhatsapp]);

  const campaignQuery = trpc.campaigns.getById.useQuery(
    { id: campaignId },
    { enabled: campaignId > 0 }
  );
  const createPaymentPreference = trpc.payments.createPaymentPreference.useMutation();

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();

    const amountInCents = Math.round(parseBrlAmount(amount) * 100);
    if (!Number.isInteger(amountInCents) || amountInCents < 100 || !donorEmail.trim() || donorWhatsapp.replace(/\D/g, "").length < 8 || donorCity.trim().length < 2) {
      toast.error("Preencha os campos obrigatórios (incluindo WhatsApp e cidade)");
      return;
    }

    setIsProcessing(true);

    saveDonor({
      donorName: donorName.trim() || "Doador",
      donorCpf: donorCpf.trim(),
      donorWhatsapp: donorWhatsapp.trim(),
      donorEmail: donorEmail.trim(),
      donorCity: donorCity.trim(),
      donorChurch: donorChurch.trim(),
    });

    createPaymentPreference.mutate(
      {
        campaignId,
        amount: amountInCents,
        paymentMethod,
        donorEmail: donorEmail.trim(),
        donorName: donorName.trim() || undefined,
        donorCpf: donorCpf.trim() || undefined,
        donorWhatsapp: donorWhatsapp.trim(),
        donorCity: donorCity.trim(),
        donorChurch: donorChurch.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          if (data.checkoutUrl) {
            if (data.contributionId) {
              sessionStorage.setItem("pdb_last_contribution_id", String(data.contributionId));
            }
            window.location.assign(data.checkoutUrl);
          } else {
            toast.error("Erro ao iniciar checkout");
            setIsProcessing(false);
          }
        },
        onError: (error) => {
          toast.error(error.message || "Erro ao processar pagamento");
          setIsProcessing(false);
        },
      }
    );
  };

  if (campaignQuery.isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#228B22]" />
      </div>
    );
  }

  if (!campaignQuery.data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-white flex items-center justify-center">
        <Card className="p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#2d2d2d] mb-2">Campanha não encontrada</h1>
          <Link href="/">
            <Button className="w-full mt-4">Voltar para Home</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const campaign = campaignQuery.data;
  const progressPercentage = Math.round((campaign.raised / campaign.goal) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[#dcdcdc]">
        <div className="container max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href={`/campaign/${campaignId}`}>
            <Button variant="ghost" size="sm" className="gap-2">
              <ChevronLeft className="w-4 h-4" />
              Voltar
            </Button>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <section className="py-12 md:py-16">
        <div className="container max-w-2xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Campaign Summary */}
            <div className="md:col-span-1">
              <Card className="p-6 sticky top-20">
                <h3 className="font-bold text-[#2d2d2d] mb-4">Resumo da Campanha</h3>
                {campaign.imageUrl && (
                  <img
                    src={campaign.imageUrl}
                    alt={campaign.title}
                    className="w-full h-40 object-cover rounded-lg mb-4"
                  />
                )}
                <h4 className="font-semibold text-[#2d2d2d] mb-2">{campaign.title}</h4>
                <p className="text-sm text-[#787878] mb-4">{campaign.description}</p>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-[#2d2d2d]">Progresso</span>
                    <span className="text-xs font-semibold text-[#228B22]">{progressPercentage}%</span>
                  </div>
                  <div className="w-full bg-[#e0e0e0] rounded-full h-2">
                    <div
                      className="bg-[#228B22] h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Amount Info */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#787878]">Arrecadado</span>
                    <span className="font-semibold text-[#228B22]">
                      R$ {(campaign.raised / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#787878]">Meta</span>
                    <span className="font-semibold text-[#2d2d2d]">
                      R$ {(campaign.goal / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Checkout Form */}
            <div className="md:col-span-2">
              <Card className="p-8">
                <h2 className="text-2xl font-bold text-[#2d2d2d] mb-2">Finalize sua Doação</h2>
                <p className="text-[#787878] mb-6">
                  Escolha o valor e complete o pagamento de forma segura
                </p>

                <form onSubmit={handleCheckout} className="space-y-6">
                  {currentDonor && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p className="text-sm text-blue-700">
                        Seus dados foram preenchidos automaticamente neste dispositivo.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-2 h-auto p-0 text-sm font-semibold text-blue-700 hover:text-blue-800"
                        onClick={handleForgetSavedDonor}
                      >
                        Esquecer meus dados neste dispositivo
                      </Button>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">
                      Forma de pagamento
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant={paymentMethod === "pix" ? "default" : "outline"}
                        className={paymentMethod === "pix" ? "bg-[#228B22]" : ""}
                        onClick={() => setPaymentMethod("pix")}
                      >
                        PIX
                      </Button>
                      <Button
                        type="button"
                        variant={paymentMethod === "card" ? "default" : "outline"}
                        className={paymentMethod === "card" ? "bg-[#228B22]" : ""}
                        onClick={() => setPaymentMethod("card")}
                      >
                        Cartão
                      </Button>
                      <Button
                        type="button"
                        variant={paymentMethod === "boleto" ? "default" : "outline"}
                        className={paymentMethod === "boleto" ? "bg-[#228B22]" : ""}
                        onClick={() => setPaymentMethod("boleto")}
                      >
                        Boleto
                      </Button>
                      <Button
                        type="button"
                        variant={paymentMethod === "cash" ? "default" : "outline"}
                        className={paymentMethod === "cash" ? "bg-[#228B22]" : ""}
                        onClick={() => setPaymentMethod("cash")}
                      >
                        Dinheiro presencial
                      </Button>
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">
                      Valor da Doação (R$) *
                    </label>
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {[50, 100, 250, 500].map((preset) => (
                        <Button
                          key={preset}
                          type="button"
                          variant={amount === preset.toString() ? "default" : "outline"}
                          className={amount === preset.toString() ? "bg-[#228B22]" : ""}
                          onClick={() => setAmount(preset.toString())}
                        >
                          R$ {preset}
                        </Button>
                      ))}
                    </div>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex.: 1.000,00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="text-lg"
                    />
                  </div>

                  {/* Donor Name */}
                  <div>
                    <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">
                      Seu Nome (opcional)
                    </label>
                    <Input
                      type="text"
                      placeholder="Como você gostaria de ser reconhecido?"
                      value={donorName}
                      onChange={(e) => setDonorName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">
                      CPF (opcional)
                    </label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      value={donorCpf}
                      onChange={(e) => setDonorCpf(e.target.value)}
                    />
                  </div>

                  {/* Donor Email */}
                  <div>
                    <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">
                      E-mail *
                    </label>
                    <Input
                      type="email"
                      placeholder="seu@email.com"
                      value={donorEmail}
                      onChange={(e) => setDonorEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">
                      WhatsApp *
                    </label>
                    <Input
                      type="tel"
                      placeholder="(11) 99999-0000"
                      value={donorWhatsapp}
                      onChange={(e) => setDonorWhatsapp(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">
                      Cidade *
                    </label>
                    <Input
                      type="text"
                      placeholder="Sua cidade"
                      value={donorCity}
                      onChange={(e) => setDonorCity(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">
                      Igreja (opcional)
                    </label>
                    <Input
                      type="text"
                      placeholder="Nome da igreja"
                      value={donorChurch}
                      onChange={(e) => setDonorChurch(e.target.value)}
                    />
                  </div>

                  {/* Info Box */}
                  <div className="bg-[#228B22]/5 border border-[#228B22]/20 rounded-lg p-4 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-[#228B22] flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-[#2d2d2d]">
                      {paymentMethod === "cash"
                        ? "A doação ficará como aguardando validação presencial. Ela só entra no total da campanha após confirmação manual do recebimento."
                        : "Você será redirecionado para a conta do Mercado Pago para completar o pagamento com segurança. Aceitamos PIX, cartão de crédito e débito."}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    className="w-full bg-[#228B22] hover:bg-[#1a6b1a] text-white font-semibold py-6 text-lg"
                    disabled={isProcessing || createPaymentPreference.isPending}
                  >
                    {isProcessing || createPaymentPreference.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      paymentMethod === "cash"
                        ? `Confirmar Doação em Dinheiro - R$ ${amount || "0,00"}`
                        : `Prosseguir para Pagamento - R$ ${amount || "0,00"}`
                    )}
                  </Button>

                  {paymentMethod !== "cash" && (
                    <p className="flex items-center justify-center gap-2 text-center text-xs text-[#787878]">
                      <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                      O pagamento será processado no ambiente seguro do Mercado Pago.
                    </p>
                  )}
                </form>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#2d2d2d] text-white py-12 mt-12">
        <div className="container max-w-7xl mx-auto px-4 text-center">
          <p className="text-gray-400">
            &copy; 2026 Parceiros do Bem. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
