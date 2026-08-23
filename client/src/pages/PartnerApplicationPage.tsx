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
};

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
        form.offer && `Como quero contribuir: ${form.offer}`,
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
          <h1 className="mt-3 text-3xl font-bold text-[#2d2d2d] md:text-4xl">Ajude a transformar vidas ao lado da gente</h1>
          <p className="mt-4 leading-relaxed text-[#656565]">Conte um pouco sobre você ou sua empresa. Analisamos seu pedido e entramos em contato pelo WhatsApp.</p>
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

              <div>
                <Label className="mb-2 block">De que forma você quer ser parceiro?</Label>
                <Textarea
                  value={form.offer}
                  onChange={(event) => setForm((current) => ({ ...current, offer: event.target.value }))}
                  rows={4}
                  placeholder="Ex: quero doar materiais, oferecer serviços, divulgar as campanhas, contribuir financeiramente todo mês..."
                />
              </div>

              <Button type="submit" className="w-full bg-[#228B22] hover:bg-[#1a6b1a]" disabled={apply.isPending}>
                {apply.isPending ? "Enviando..." : "Enviar pedido"}
              </Button>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}
