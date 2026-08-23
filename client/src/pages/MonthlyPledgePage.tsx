import { useState } from "react";
import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { CalendarClock, ChevronLeft, MessageCircle } from "lucide-react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";

const ADMIN_WHATSAPP_NUMBER = "5564999058919";
const INSTALLMENT_OPTIONS = [5, 10, 12, 20];
const SUGGESTED_AMOUNTS = [100, 200, 300];

const formatCurrency = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function parseCurrencyToCents(value: string): number | null {
  const cleaned = value.trim().replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;

  const decimalIndex = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
  let integerPart: string;
  let decimalPart = "00";

  if (decimalIndex !== -1 && cleaned.length - decimalIndex - 1 <= 2) {
    integerPart = cleaned.slice(0, decimalIndex).replace(/[.,]/g, "");
    decimalPart = cleaned.slice(decimalIndex + 1).padEnd(2, "0").slice(0, 2);
  } else {
    integerPart = cleaned.replace(/[.,]/g, "");
  }

  if (!integerPart) return null;
  const cents = Number.parseInt(integerPart, 10) * 100 + Number.parseInt(decimalPart, 10);
  return Number.isFinite(cents) ? cents : null;
}

const EMPTY_FORM = {
  fullName: "",
  cpf: "",
  whatsapp: "",
  email: "",
  city: "",
  totalAmount: "",
  installments: 10,
  consent: false,
};

export default function MonthlyPledgePage() {
  const [, params] = useRoute("/parceiro-mensal/:campaignId");
  const campaignId = Number(params?.campaignId);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCustomAmount, setShowCustomAmount] = useState(false);
  const [submitted, setSubmitted] = useState<{ installmentAmountCents: number } | null>(null);

  const campaignQuery = trpc.campaigns.getById.useQuery({ id: campaignId }, { enabled: Number.isInteger(campaignId) && campaignId > 0 });

  const createPledge = trpc.monthlyPledges.create.useMutation({
    onSuccess: (result) => {
      const totalAmountCents = parseCurrencyToCents(form.totalAmount) ?? 0;
      const summaryLines = [
        `Olá! Quero ser sócio doador da campanha "${campaignQuery.data?.title ?? ""}".`,
        `Nome: ${form.fullName}`,
        `CPF: ${form.cpf}`,
        `WhatsApp: ${form.whatsapp}`,
        form.email && `E-mail: ${form.email}`,
        form.city && `Cidade: ${form.city}`,
        `Valor total: ${formatCurrency(totalAmountCents)} em ${form.installments}x de ${formatCurrency(result.installmentAmountCents)}`,
        `Autorizo ser lembrado(a) todo mês sobre essa contribuição.`,
      ].filter(Boolean).join("\n");

      window.open(`https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(summaryLines)}`, "_blank", "noopener,noreferrer");
      setSubmitted({ installmentAmountCents: result.installmentAmountCents });
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar. Tente novamente."),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const totalAmountCents = parseCurrencyToCents(form.totalAmount);
    if (!form.fullName.trim() || !form.cpf.trim() || !form.whatsapp.trim()) {
      toast.error("Preencha nome, CPF e WhatsApp para continuar.");
      return;
    }
    if (!totalAmountCents || totalAmountCents <= 0) {
      toast.error("Informe o valor total do compromisso.");
      return;
    }
    if (!form.consent) {
      toast.error("É preciso autorizar ser lembrado(a) mensalmente para continuar.");
      return;
    }

    createPledge.mutate({
      campaignId,
      fullName: form.fullName.trim(),
      cpf: form.cpf.trim(),
      whatsapp: form.whatsapp.trim(),
      email: form.email.trim() || undefined,
      city: form.city.trim() || undefined,
      totalAmountCents,
      installments: form.installments,
    });
  }

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <main className="container max-w-2xl px-4 py-12 md:py-16">
        <Link href={`/campaign/${campaignId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#4f6550] hover:text-[#228B22]">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar à campanha
        </Link>

        <div className="mt-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#228B22]/10">
            <CalendarClock className="h-8 w-8 text-[#228B22]" aria-hidden="true" />
          </div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">Sócio doador</p>
          <h1 className="mt-3 text-3xl font-bold text-[#2d2d2d] md:text-4xl">
            {campaignQuery.data ? `Contribua todo mês com ${campaignQuery.data.title}` : "Contribua todo mês com essa campanha"}
          </h1>
          <p className="mt-4 leading-relaxed text-[#656565]">
            Escolha um valor total e quantas vezes quer dividir. Todo mês te lembramos da parcela — nada é cobrado automaticamente, você paga do seu jeito quando avisarmos.
          </p>
        </div>

        {submitted ? (
          <Card className="mt-10 p-8 text-center">
            <MessageCircle className="mx-auto h-10 w-10 text-[#228B22]" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-bold text-[#2d2d2d]">Compromisso registrado!</h2>
            <p className="mt-2 leading-relaxed text-[#656565]">
              Sua parcela mensal fica em <strong>{formatCurrency(submitted.installmentAmountCents)}</strong>. Abrimos o WhatsApp pra confirmar direto com a gente — se a janela não abriu, chama a gente por lá.
            </p>
            <a
              href={`https://wa.me/${ADMIN_WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#228B22] px-6 font-semibold text-white hover:bg-[#1a6b1a]"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Abrir WhatsApp
            </a>
          </Card>
        ) : (
          <Card className="mt-10 p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label className="mb-2 block">Nome completo *</Label>
                <Input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} required minLength={3} />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label className="mb-2 block">CPF *</Label>
                  <Input value={form.cpf} onChange={(event) => setForm((current) => ({ ...current, cpf: event.target.value }))} required placeholder="000.000.000-00" />
                </div>
                <div>
                  <Label className="mb-2 block">WhatsApp *</Label>
                  <Input value={form.whatsapp} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} required placeholder="(64) 99999-9999" />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label className="mb-2 block">E-mail</Label>
                  <Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                </div>
                <div>
                  <Label className="mb-2 block">Cidade</Label>
                  <Input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Valor total do compromisso *</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SUGGESTED_AMOUNTS.map((amount) => {
                    const isSelected = !showCustomAmount && parseCurrencyToCents(form.totalAmount) === amount * 100;
                    return (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => { setShowCustomAmount(false); setForm((current) => ({ ...current, totalAmount: String(amount) })); }}
                        className={`min-h-11 rounded-md border px-3 text-sm font-semibold transition ${isSelected ? "border-[#228B22] bg-[#228B22] text-white" : "border-[#dce5d8] bg-white text-[#4f6550] hover:border-[#228B22]"}`}
                      >
                        {formatCurrency(amount * 100)}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => { setShowCustomAmount(true); setForm((current) => ({ ...current, totalAmount: "" })); }}
                    className={`min-h-11 rounded-md border px-3 text-sm font-semibold transition ${showCustomAmount ? "border-[#228B22] bg-[#228B22] text-white" : "border-[#dce5d8] bg-white text-[#4f6550] hover:border-[#228B22]"}`}
                  >
                    Outro valor
                  </button>
                </div>
                {showCustomAmount && (
                  <Input
                    className="mt-3"
                    value={form.totalAmount}
                    onChange={(event) => setForm((current) => ({ ...current, totalAmount: event.target.value }))}
                    required
                    placeholder="R$ 150,00"
                    inputMode="numeric"
                    autoFocus
                  />
                )}
              </div>

              <div>
                <Label className="mb-2 block">Em quantas vezes *</Label>
                <Select value={String(form.installments)} onValueChange={(value) => setForm((current) => ({ ...current, installments: Number(value) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INSTALLMENT_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>{option}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(() => {
                const totalAmountCents = parseCurrencyToCents(form.totalAmount);
                if (!totalAmountCents) return null;
                const installmentAmountCents = Math.round(totalAmountCents / form.installments);
                return (
                  <p className="rounded-lg bg-[#f1f6ef] px-4 py-3 text-sm text-[#4f6550]">
                    Isso dá <strong>{form.installments}x de {formatCurrency(installmentAmountCents)}</strong> por mês.
                  </p>
                );
              })()}

              <div className="flex items-start gap-3 rounded-lg border border-[#dce5d8] p-4">
                <Checkbox id="consent" checked={form.consent} onCheckedChange={(checked) => setForm((current) => ({ ...current, consent: checked === true }))} className="mt-0.5" />
                <Label htmlFor="consent" className="font-normal leading-relaxed text-[#4f6550]">
                  Autorizo ser lembrado(a) todo mês sobre esse compromisso, por WhatsApp.
                </Label>
              </div>

              <Button type="submit" className="w-full bg-[#228B22] hover:bg-[#1a6b1a]" disabled={createPledge.isPending}>
                {createPledge.isPending ? "Enviando..." : "Confirmar compromisso mensal"}
              </Button>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}
