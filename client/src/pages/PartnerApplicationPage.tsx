import { useState } from "react";
import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Handshake, MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const ADMIN_WHATSAPP_NUMBER = "5564999058919";

const EMPTY_FORM = {
  type: "company" as "company" | "individual",
  companyName: "",
  segment: "",
  contactName: "",
  phone: "",
  email: "",
  offer: "",
  contributionKinds: [] as string[],
  monthlyValue: "",
  durationMonths: "6",
  motivation: "",
};

/** As formas de contribuir valem o mesmo: R$ 1.000 em material é R$ 1.000 em dinheiro. */
const CONTRIBUTION_KINDS = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "material", label: "Material" },
  { id: "mao_de_obra", label: "Mão de obra" },
  { id: "servico", label: "Serviço" },
  { id: "divulgacao", label: "Divulgação e alcance" },
  { id: "outro", label: "Outro" },
];

function parseValorParaCentavos(texto: string): number | undefined {
  const limpo = texto.replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".");
  if (!limpo) return undefined;
  const numero = Number(limpo);
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) : undefined;
}

export default function PartnerApplicationPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);

  const apply = trpc.partnerApplications.submit.useMutation({
    onSuccess: () => {
      const summaryLines = [
        `Olá! Quero ser parceiro da Parceria do Bem.`,
        `Tipo: ${form.type === "company" ? "Empresa" : "Pessoa física"}`,
        `Nome: ${form.companyName}`,
        form.segment && `Ramo/segmento: ${form.segment}`,
        form.contactName && `Responsável: ${form.contactName}`,
        `Telefone: ${form.phone}`,
        form.email && `E-mail: ${form.email}`,
        form.contributionKinds.length &&
          `Formas: ${form.contributionKinds
            .map((id) => CONTRIBUTION_KINDS.find((k) => k.id === id)?.label ?? id)
            .join(", ")}`,
        form.monthlyValue && `Valor mensal equivalente: R$ ${form.monthlyValue}`,
        form.durationMonths && `Por: ${form.durationMonths} meses`,
        form.offer && `Proposta: ${form.offer}`,
        form.motivation && `Por que essa causa me move: ${form.motivation}`,
      ].filter(Boolean).join("\n");

      window.open(`https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(summaryLines)}`, "_blank", "noopener,noreferrer");
      setSubmitted(true);
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar. Tente novamente."),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.companyName.trim() || !form.phone.trim()) {
      toast.error("Preencha nome e telefone para continuar.");
      return;
    }
    apply.mutate({
      type: form.type,
      companyName: form.companyName.trim(),
      segment: form.segment.trim() || undefined,
      contactName: form.contactName.trim() || undefined,
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      offer: form.offer.trim() || undefined,
      contributionKinds: form.contributionKinds.length ? form.contributionKinds : undefined,
      monthlyValueCents: parseValorParaCentavos(form.monthlyValue),
      durationMonths: form.durationMonths ? Number(form.durationMonths) : undefined,
      motivation: form.motivation.trim() || undefined,
    });
  }

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <main className="container max-w-2xl px-4 py-12 md:py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#4f6550] hover:text-[#228B22]">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao início
        </Link>

        <div className="mt-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#228B22]/10">
            <Handshake className="h-8 w-8 text-[#228B22]" aria-hidden="true" />
          </div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">Quero ser parceiro</p>
          <h1 className="mt-3 text-3xl font-bold text-[#2d2d2d] md:text-4xl">Parceiro não é patrocinador</h1>
          <p className="mt-4 leading-relaxed text-[#656565]">
            É quem escolhe caminhar junto — colocando o que tem, do jeito que pode, para transformar vidas com a gente.
          </p>
        </div>

        {/* Explicar antes de perguntar: sem isto, o que chegava era boa vontade sem
            proposta, porque ninguém tinha como saber o que era esperado. */}
        <div className="mt-10 space-y-6">
          <Card className="p-6 md:p-8">
            <h2 className="text-lg font-bold text-[#2d2d2d]">O que é a parceria</h2>
            <p className="mt-3 leading-relaxed text-[#656565]">
              Uma empresa ou pessoa que se compromete a contribuir de forma <strong>contínua</strong> com as campanhas e
              obras do Parceria do Bem. A contribuição pode ser em <strong>dinheiro, material, mão de obra ou serviço</strong>.
              Para nós, vale o mesmo.
            </p>
          </Card>

          <Card className="border-[#228B22]/30 bg-[#f3f8f3] p-6 md:p-8">
            <h2 className="text-lg font-bold text-[#2d2d2d]">A referência</h2>
            <p className="mt-2 text-2xl font-bold text-[#228B22]">R$ 1.000 por mês, durante 6 meses</p>
            <p className="mt-3 leading-relaxed text-[#656565]">
              Em dinheiro, em material de construção, em horas de trabalho, em serviço prestado. O que a sua empresa faz
              melhor é o que a gente precisa.
            </p>
            <ul className="mt-4 space-y-2 text-[#656565]">
              <li>• Uma loja de materiais que entrega R$ 1.000 em cimento e areia por mês</li>
              <li>• Um eletricista que assume a parte elétrica de uma obra</li>
              <li>• Uma gráfica que cuida da comunicação das campanhas</li>
            </ul>
          </Card>

          <Card className="p-6 md:p-8">
            <h2 className="text-lg font-bold text-[#2d2d2d]">O que você recebe</h2>
            <ul className="mt-3 space-y-3 text-[#656565]">
              <li>• <strong className="text-[#2d2d2d]">Página exclusiva no site</strong> durante todo o período da parceria</li>
              <li>• <strong className="text-[#2d2d2d]">Vídeo nosso</strong> apresentando sua empresa e o que ela faz por essas famílias</li>
              <li>• <strong className="text-[#2d2d2d]">Espaço para o seu depoimento</strong> — sua empresa contando, com as próprias palavras, por que abraçou</li>
              <li>• <strong className="text-[#2d2d2d]">Presença nas campanhas</strong> que você apoiar</li>
            </ul>
            <p className="mt-5 leading-relaxed text-[#656565]">
              <strong className="text-[#2d2d2d]">Tem outra ideia?</strong> Conta pra gente. Os critérios existem para
              orientar, não para fechar portas.
            </p>
          </Card>
        </div>

        {submitted ? (
          <Card className="mt-10 p-8 text-center">
            <MessageCircle className="mx-auto h-10 w-10 text-[#228B22]" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-bold text-[#2d2d2d]">Pedido enviado!</h2>
            <p className="mt-2 leading-relaxed text-[#656565]">Recebemos seus dados e abrimos o WhatsApp pra você continuar a conversa direto com a gente. Se a janela não abriu, chama a gente por lá.</p>
            <a
              href={`https://wa.me/${ADMIN_WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#228B22] px-6 font-semibold text-white hover:bg-[#1b711b]"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Abrir WhatsApp
            </a>
          </Card>
        ) : (
          <Card className="mt-10 p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label className="mb-2 block">Você é...</Label>
                <RadioGroup
                  value={form.type}
                  onValueChange={(value: "company" | "individual") => setForm((current) => ({ ...current, type: value }))}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="company" id="type-company" />
                    <Label htmlFor="type-company" className="font-normal">Empresa</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="individual" id="type-individual" />
                    <Label htmlFor="type-individual" className="font-normal">Pessoa física</Label>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Label className="mb-2 block">{form.type === "company" ? "Nome da empresa *" : "Seu nome *"}</Label>
                <Input value={form.companyName} onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))} required minLength={2} />
              </div>

              {form.type === "company" && (
                <div>
                  <Label className="mb-2 block">Ramo/segmento</Label>
                  <Input value={form.segment} onChange={(event) => setForm((current) => ({ ...current, segment: event.target.value }))} placeholder="Ex: loja de material de construção" />
                </div>
              )}

              {form.type === "company" && (
                <div>
                  <Label className="mb-2 block">Responsável</Label>
                  <Input value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} placeholder="Nome de quem vamos falar com" />
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label className="mb-2 block">Telefone/WhatsApp *</Label>
                  <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} required placeholder="(64) 99999-9999" />
                </div>
                <div>
                  <Label className="mb-2 block">E-mail</Label>
                  <Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                </div>
              </div>

              <div className="border-t border-[#e3ebe3] pt-5">
                <Label className="mb-2 block">Como pretende contribuir?</Label>
                <p className="mb-3 text-sm text-[#656565]">Pode marcar mais de uma.</p>
                <div className="flex flex-wrap gap-2">
                  {CONTRIBUTION_KINDS.map((kind) => {
                    const marcado = form.contributionKinds.includes(kind.id);
                    return (
                      <button
                        key={kind.id}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            contributionKinds: marcado
                              ? current.contributionKinds.filter((id) => id !== kind.id)
                              : [...current.contributionKinds, kind.id],
                          }))
                        }
                        className={`rounded-full border px-4 py-2 text-sm transition ${
                          marcado
                            ? "border-[#228B22] bg-[#228B22] font-semibold text-white"
                            : "border-[#d7e2d7] text-[#4f6550] hover:border-[#228B22]"
                        }`}
                      >
                        {kind.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label className="mb-2 block">Valor mensal equivalente</Label>
                  <Input
                    inputMode="decimal"
                    value={form.monthlyValue}
                    onChange={(event) => setForm((current) => ({ ...current, monthlyValue: event.target.value }))}
                    placeholder="1.000,00"
                  />
                  <p className="mt-1 text-sm text-[#8a968a]">Em dinheiro, material ou serviço — vale o mesmo.</p>
                </div>
                <div>
                  <Label className="mb-2 block">Por quanto tempo</Label>
                  <select
                    value={form.durationMonths}
                    onChange={(event) => setForm((current) => ({ ...current, durationMonths: event.target.value }))}
                    className="h-10 w-full rounded-md border border-[#d7e2d7] bg-white px-3 text-sm"
                  >
                    <option value="6">6 meses</option>
                    <option value="12">12 meses</option>
                    <option value="24">24 meses</option>
                    <option value="">Prefiro conversar</option>
                  </select>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Descreva sua proposta</Label>
                <Textarea
                  value={form.offer}
                  onChange={(event) => setForm((current) => ({ ...current, offer: event.target.value }))}
                  rows={4}
                  placeholder="Ex: minha loja entrega R$ 1.000 em material de construção por mês, retirado na obra conforme a necessidade."
                />
              </div>

              <div>
                <Label className="mb-2 block">Por que essa causa te move? <span className="font-normal text-[#8a968a]">(opcional)</span></Label>
                <Textarea
                  value={form.motivation}
                  onChange={(event) => setForm((current) => ({ ...current, motivation: event.target.value }))}
                  rows={3}
                  placeholder="Se virar parceria, essa resposta pode virar o seu depoimento no site."
                />
              </div>

              <Button type="submit" className="w-full bg-[#228B22] hover:bg-[#1a6b1a]" disabled={apply.isPending}>
                {apply.isPending ? "Enviando..." : "Enviar proposta"}
              </Button>

              <p className="text-center text-sm leading-relaxed text-[#8a968a]">
                Vamos entrar em contato para conversar antes de confirmar.
                <br />
                Parceria se combina, não se cadastra.
              </p>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}
