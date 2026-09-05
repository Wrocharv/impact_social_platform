import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Heart, Lock, MailCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type Step = "identify" | "code" | "history";
type IdentityMode = "cpf" | "whatsapp";

type Donation = {
  id: number;
  type: "financial" | "material" | "volunteer";
  amount: number | null;
  description: string | null;
  status: string | null;
  campaignTitle: string | null;
  createdAt: string;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

const STATUS_LABEL: Record<string, string> = {
  approved: "Confirmada",
  completed: "Confirmada",
  pending: "Aguardando confirmação",
  rejected: "Não confirmada",
  cancelled: "Cancelada",
  refunded: "Devolvida",
};

export default function MyDonationsPage() {
  const [step, setStep] = useState<Step>("identify");
  const [mode, setMode] = useState<IdentityMode>("cpf");
  const [identityValue, setIdentityValue] = useState("");
  const [code, setCode] = useState("");
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [donorName, setDonorName] = useState<string | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [totalDonatedCents, setTotalDonatedCents] = useState(0);

  const identityPayload =
    mode === "cpf" ? { donorCpf: identityValue } : { donorWhatsapp: identityValue };

  const requestCode = trpc.contributions.requestDonorAccessCode.useMutation({
    onSuccess: (result) => {
      if (result.status === "sent") {
        setEmailHint(result.emailHint ?? null);
        setStep("code");
        toast.success("Código enviado! Confira seu e-mail.");
        return;
      }
      if (result.status === "throttled") {
        toast.info("Já enviamos um código agora há pouco. Confira seu e-mail antes de pedir outro.");
        setStep("code");
        return;
      }
      // Resposta deliberadamente vaga: pode ser que não haja doação com esses
      // dados, ou que a doação não tenha e-mail. Dizer qual dos dois entregaria
      // a quem chutasse um CPF a informação que estamos protegendo.
      toast.error("Não conseguimos enviar o código. Fale com a gente que resolvemos junto.");
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar o código agora."),
  });

  const openHistory = trpc.contributions.getMyDonations.useMutation({
    onSuccess: (result) => {
      setDonorName(result.donorName);
      setDonations(result.donations as Donation[]);
      setTotalDonatedCents(result.totalDonatedCents);
      setStep("history");
    },
    onError: (error) => toast.error(error.message || "Não foi possível abrir seu histórico."),
  });

  function handleRequestCode() {
    const digits = identityValue.replace(/\D/g, "");
    if (mode === "cpf" && digits.length !== 11) {
      toast.error("Digite os 11 números do seu CPF.");
      return;
    }
    if (mode === "whatsapp" && digits.length < 10) {
      toast.error("Digite seu WhatsApp com DDD.");
      return;
    }
    requestCode.mutate(identityPayload);
  }

  function handleOpenHistory() {
    if (code.trim().length !== 6) {
      toast.error("O código tem 6 números.");
      return;
    }
    openHistory.mutate({ ...identityPayload, code: code.trim() });
  }

  function restart() {
    setStep("identify");
    setCode("");
    setEmailHint(null);
    setDonations([]);
    setDonorName(null);
    setTotalDonatedCents(0);
  }

  return (
    <>
      <PublicHeader />
      <main className="min-h-screen bg-gradient-to-b from-[#f8faf7] to-white">
        <section className="border-b border-[#e2e7e0] bg-white py-12 md:py-16">
          <div className="container max-w-3xl px-4">
            <Link
              href="/donors"
              className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#228B22]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para os doadores
            </Link>
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-[#228B22]/10 p-3">
                <Lock className="h-7 w-7 text-[#228B22]" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-[#2d2d2d] md:text-5xl">Minhas doações</h1>
                <p className="mt-3 text-lg text-[#6d6d6d]">
                  Este é o único lugar do site onde os valores aparecem — e só pra você.
                  Por isso confirmamos que é você mesmo antes de abrir.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="container max-w-3xl px-4">
            {step === "identify" && (
              <Card className="p-6 md:p-8">
                <h2 className="text-2xl font-bold text-[#2d2d2d]">Como você se identifica?</h2>
                <p className="mt-2 text-[#6d6d6d]">
                  Vamos mandar um código de 6 números para o e-mail que você deixou na doação.
                  Sem cadastro e sem senha.
                </p>

                <div className="mt-6 flex gap-2">
                  {(["cpf", "whatsapp"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setMode(option);
                        setIdentityValue("");
                      }}
                      className={`min-h-11 flex-1 rounded-md border px-4 font-semibold transition ${
                        mode === option
                          ? "border-[#228B22] bg-[#228B22] text-white"
                          : "border-[#d8e0d6] bg-white text-[#4e5c53] hover:border-[#228B22]"
                      }`}
                    >
                      {option === "cpf" ? "Pelo CPF" : "Pelo WhatsApp"}
                    </button>
                  ))}
                </div>

                <div className="mt-6">
                  <Label htmlFor="donor-identity">
                    {mode === "cpf" ? "Seu CPF" : "Seu WhatsApp (com DDD)"}
                  </Label>
                  <Input
                    id="donor-identity"
                    inputMode="numeric"
                    autoComplete={mode === "cpf" ? "off" : "tel"}
                    placeholder={mode === "cpf" ? "000.000.000-00" : "(00) 00000-0000"}
                    value={identityValue}
                    onChange={(event) => setIdentityValue(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && handleRequestCode()}
                    className="mt-2"
                  />
                </div>

                <Button
                  onClick={handleRequestCode}
                  disabled={requestCode.isPending}
                  className="mt-6 min-h-12 w-full bg-[#228B22] font-semibold hover:bg-[#1b711b]"
                >
                  {requestCode.isPending ? "Enviando..." : "Receber código por e-mail"}
                </Button>
              </Card>
            )}

            {step === "code" && (
              <Card className="p-6 md:p-8">
                <MailCheck className="h-10 w-10 text-[#228B22]" aria-hidden="true" />
                <h2 className="mt-4 text-2xl font-bold text-[#2d2d2d]">Digite o código</h2>
                <p className="mt-2 text-[#6d6d6d]">
                  {emailHint
                    ? `Mandamos um código de 6 números para ${emailHint}. Ele vale por 10 minutos.`
                    : "Mandamos um código de 6 números para o seu e-mail. Ele vale por 10 minutos."}
                </p>

                <div className="mt-6">
                  <Label htmlFor="donor-code">Código</Label>
                  <Input
                    id="donor-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    onKeyDown={(event) => event.key === "Enter" && handleOpenHistory()}
                    className="mt-2 text-center text-2xl tracking-[0.4em]"
                  />
                </div>

                <Button
                  onClick={handleOpenHistory}
                  disabled={openHistory.isPending}
                  className="mt-6 min-h-12 w-full bg-[#228B22] font-semibold hover:bg-[#1b711b]"
                >
                  {openHistory.isPending ? "Conferindo..." : "Ver minhas doações"}
                </Button>

                <button
                  type="button"
                  onClick={restart}
                  className="mt-4 w-full text-sm font-semibold text-[#4e5c53] underline underline-offset-4"
                >
                  Usar outro CPF ou WhatsApp
                </button>
              </Card>
            )}

            {step === "history" && (
              <div className="space-y-6">
                <Card className="p-6 md:p-8">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4f6550]">
                    {donorName ? `Olá, ${donorName.split(" ")[0]}` : "Seu histórico"}
                  </p>
                  <p className="mt-3 text-sm text-[#6d6d6d]">Total já confirmado em doações financeiras</p>
                  <p className="mt-1 text-4xl font-bold text-[#228B22]">{formatCurrency(totalDonatedCents)}</p>
                  <p className="mt-4 text-sm text-[#6d6d6d]">
                    Esse valor é só seu: no mural público aparece apenas o seu nome, nunca o quanto.
                  </p>
                </Card>

                {donations.length === 0 ? (
                  <Card className="border-dashed p-10 text-center">
                    <Heart className="mx-auto h-10 w-10 text-[#228B22]" aria-hidden="true" />
                    <h3 className="mt-4 text-xl font-semibold text-[#2d2d2d]">Nenhuma doação por aqui ainda</h3>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {donations.map((donation) => (
                      <Card key={donation.id} className="p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[#2d2d2d]">
                              {donation.campaignTitle || "Contribuição geral"}
                            </p>
                            <p className="mt-1 text-sm text-[#787878]">{formatDate(donation.createdAt)}</p>
                          </div>
                          <div className="text-right">
                            {donation.type === "financial" ? (
                              <p className="text-xl font-bold text-[#228B22]">
                                {formatCurrency(donation.amount ?? 0)}
                              </p>
                            ) : (
                              <p className="font-semibold text-[#228B22]">
                                {donation.description?.trim()
                                  || (donation.type === "volunteer" ? "Voluntariado" : "Material")}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-[#787878]">
                              {STATUS_LABEL[donation.status ?? ""] ?? "Registrada"}
                            </p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={restart}
                  className="w-full text-sm font-semibold text-[#4e5c53] underline underline-offset-4"
                >
                  Sair do histórico
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
