import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";
import { CalendarClock, Check, Copy, MessageCircle } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { brl, centavosParaCampo, ddmmaaaa, paraCentavos, vencimentosDesdeHoje } from "@/lib/carne";

const ADMIN_WHATSAPP_NUMBER = "5564999058919";
// Mesmas opcoes do socio doador do Hotel Recanto de Paz.
const VALORES = [500, 1000, 2000];
const PARCELAS = [5, 10, 12, 20];
const DIAS = [5, 10, 15, 20, 25];

type Feito = { totalAmountCents: number; installments: number; installmentAmountCents: number; downPaymentCents: number; dia: number };
type Forma = "parcelado" | "entrada" | "avista";

/** Cadastro de quem leu o QR do carne de uma campanha rapida, e o carne digital logo em seguida. */
export default function QuickPledgePage() {
  const [, params] = useRoute("/carne/:id");
  const id = Number(params?.id);
  const campanha = trpc.quickCampaigns.getPublic.useQuery({ id }, { enabled: Number.isInteger(id) && id > 0, retry: false });
  const c = campanha.data;
  const travado = !!c && !c.allowCustomAmount && !!c.suggestedTotalCents && !!c.suggestedInstallments;

  const [form, setForm] = useState({ nome: "", whatsapp: "", cidade: "", valor: "", parcelas: 10, dia: 10, ok: false });
  const [feito, setFeito] = useState<Feito | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [outroValor, setOutroValor] = useState(false);
  const [forma, setForma] = useState<Forma>("parcelado");
  const [entrada, setEntrada] = useState("");

  useEffect(() => {
    if (!c) return;
    setForm((f) => ({
      ...f,
      valor: f.valor || centavosParaCampo(c.suggestedTotalCents),
      parcelas: c.suggestedInstallments ?? f.parcelas,
    }));
  }, [c]);

  const criar = trpc.quickCampaigns.createPledge.useMutation({
    onSuccess: (r) => {
      setFeito({ ...r, dia: form.dia });
      const texto = [
        `Olá! Fiz meu compromisso com a campanha "${c?.title ?? ""}"${c?.subtitle ? ` (${c.subtitle})` : ""}.`,
        `Nome: ${form.nome}`,
        `WhatsApp: ${form.whatsapp}`,
        form.cidade && `Cidade: ${form.cidade}`,
        r.installments === 0
          ? `À vista: ${brl(r.totalAmountCents)}`
          : `${r.downPaymentCents ? `Entrada de ${brl(r.downPaymentCents)} + ` : ""}${r.installments}x de ${brl(r.installmentAmountCents)} (total ${brl(r.totalAmountCents)}), todo dia ${form.dia}`,
      ]
        .filter(Boolean)
        .join("\n");
      window.open(`https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
    },
    onError: (e) => toast.error(e.message || "Não foi possível enviar. Tente novamente."),
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const total = paraCentavos(form.valor);
    if (form.nome.trim().length < 3 || form.whatsapp.replace(/\D/g, "").length < 8) return toast.error("Preencha nome e WhatsApp.");
    if (!travado && !total) return toast.error("Informe o valor total.");
    if (!form.ok) return toast.error("É preciso autorizar o lembrete pelo WhatsApp.");
    const totalFinal = travado ? c!.suggestedTotalCents! : total!;
    const entradaCents = forma === "entrada" ? paraCentavos(entrada) : 0;
    if (forma === "entrada" && (!entradaCents || entradaCents >= totalFinal)) return toast.error("Informe uma entrada menor que o valor total.");
    criar.mutate({
      quickCampaignId: id,
      fullName: form.nome.trim(),
      whatsapp: form.whatsapp.trim(),
      city: form.cidade.trim() || undefined,
      totalAmountCents: totalFinal,
      installments: forma === "avista" ? 0 : travado ? c!.suggestedInstallments! : form.parcelas,
      downPaymentCents: forma === "entrada" ? entradaCents! : 0,
      reminderDay: form.dia,
    });
  }

  async function copiarPix() {
    if (!c?.pixKey) return;
    try {
      await navigator.clipboard.writeText(c.pixKey);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não deu pra copiar. Copie a chave à mão.");
    }
  }

  const total = travado ? c!.suggestedTotalCents! : paraCentavos(form.valor);
  const parcelas = travado ? c!.suggestedInstallments! : form.parcelas;
  // O valor sugerido da campanha (se houver) vem primeiro, junto dos de sempre.
  const entradaCents = forma === "entrada" ? paraCentavos(entrada) ?? 0 : 0;
  const resumo = !total
    ? null
    : forma === "avista"
      ? <>Você paga <strong>{brl(total)}</strong> agora, à vista.</>
      : forma === "entrada"
        ? entradaCents > 0 && entradaCents < total
          ? <>Entrada de <strong>{brl(entradaCents)}</strong> agora + <strong>{parcelas}x de {brl(Math.round((total - entradaCents) / parcelas))}</strong>, todo dia {form.dia}.</>
          : null
        : <>Isso dá <strong>{parcelas}x de {brl(Math.round(total / parcelas))}</strong> por mês, todo dia {form.dia}.</>;
  const opcoesValor = Array.from(new Set([...(c?.suggestedTotalCents ? [c.suggestedTotalCents] : []), ...VALORES.map((v) => v * 100)])).sort((a, b) => a - b);
  const opcoesParcelas = Array.from(new Set([...PARCELAS, ...(c?.suggestedInstallments ? [c.suggestedInstallments] : [])])).sort((a, b) => a - b);
  const botao = (ativo: boolean) =>
    `min-h-11 rounded-md border px-2 text-sm font-semibold transition ${ativo ? "border-[#228B22] bg-[#228B22] text-white" : "border-[#dce5d8] bg-white text-[#4f6550] hover:border-[#228B22]"}`;

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <main className="container max-w-2xl px-4 py-10 md:py-14">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#228B22]/10">
            <CalendarClock className="h-8 w-8 text-[#228B22]" aria-hidden="true" />
          </div>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">Carnê de contribuição</p>
          <h1 className="mt-2 text-3xl font-bold text-[#2d2d2d] md:text-4xl">{c?.title ?? (campanha.isLoading ? "Carregando..." : "Campanha")}</h1>
          {c?.subtitle && <p className="mt-2 text-lg text-[#4f6550]">{c.subtitle}</p>}
        </div>

        {campanha.error ? (
          <Card className="mt-10 p-8 text-center text-[#656565]">Não encontramos essa campanha. Confira o QR code com quem te entregou o carnê.</Card>
        ) : c && !c.aberta ? (
          <Card className="mt-10 p-8 text-center text-[#656565]">Essa campanha já foi encerrada. Obrigado pelo carinho!</Card>
        ) : feito ? (
          <Card className="mt-10 p-6 md:p-8">
            <div className="text-center">
              <MessageCircle className="mx-auto h-10 w-10 text-[#228B22]" aria-hidden="true" />
              <h2 className="mt-3 text-xl font-bold text-[#2d2d2d]">Compromisso registrado!</h2>
              <p className="mt-1 text-sm text-[#656565]">Este é o seu carnê. Tire um print para guardar.</p>
            </div>
            <ul className="mt-6 divide-y divide-dashed divide-[#cfdacb] rounded-lg border border-dashed border-[#cfdacb]">
              {feito.downPaymentCents > 0 && (
                <li className="flex items-center justify-between gap-2 bg-[#f1f6ef] px-4 py-2.5 text-sm">
                  <span className="font-semibold text-[#243128]">{feito.installments === 0 ? "À vista" : "Entrada"}</span>
                  <span className="text-[#4f6550]">pagar agora</span>
                  <span className="font-bold text-[#243128]">{brl(feito.downPaymentCents)}</span>
                </li>
              )}
              {vencimentosDesdeHoje(feito.installments, feito.dia).map((v, i) => (
                <li key={v} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="whitespace-nowrap font-semibold text-[#243128]">
                    Parcela {i + 1}/{feito.installments}
                  </span>
                  <span className="whitespace-nowrap text-[#4f6550]">{ddmmaaaa(v)}</span>
                  <span className="font-bold text-[#243128]">{brl(feito.installmentAmountCents)}</span>
                </li>
              ))}
            </ul>
            {c?.pixKey && (
              <div className="mt-6 rounded-lg bg-[#f1f6ef] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#55645a]">Pague pelo Pix</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="break-all text-lg font-bold text-[#243128]">{c.pixKey}</p>
                  <Button type="button" size="sm" variant="outline" onClick={copiarPix}>
                    {copiado ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />} {copiado ? "Copiado" : "Copiar"}
                  </Button>
                </div>
                {c.pixName && <p className="text-sm text-[#4f6550]">{c.pixName}</p>}
              </div>
            )}
            <p className="mt-4 text-center text-sm text-[#656565]">Depois de pagar, mande o comprovante no WhatsApp. Perto de cada vencimento a gente te lembra.</p>
            <a
              href={`https://wa.me/${ADMIN_WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#228B22] px-6 font-semibold text-white hover:bg-[#1a6b1a]"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Enviar comprovante pelo WhatsApp
            </a>
          </Card>
        ) : (
          <Card className="mt-8 p-6 md:p-8">
            <form onSubmit={enviar} className="space-y-5">
              <div>
                <Label className="mb-2 block">Nome completo *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label className="mb-2 block">WhatsApp *</Label>
                  <Input value={form.whatsapp} inputMode="tel" placeholder="(64) 99999-9999" onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-2 block">Cidade / congregação</Label>
                  <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                </div>
              </div>

              {/* Valor */}
              {travado ? (
                <p className="rounded-lg bg-[#f1f6ef] px-4 py-3 text-[#4f6550]">
                  Valor do carnê: <strong>{brl(total!)}</strong>{forma === "parcelado" ? ` em ${parcelas}x` : ""}
                </p>
              ) : (
                <>
                  <div>
                    <Label className="mb-2 block">Valor total do compromisso *</Label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {opcoesValor.map((cents) => (
                        <button
                          key={cents}
                          type="button"
                          className={botao(!outroValor && paraCentavos(form.valor) === cents)}
                          onClick={() => {
                            setOutroValor(false);
                            setForm({ ...form, valor: centavosParaCampo(cents) });
                          }}
                        >
                          {brl(cents)}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={botao(outroValor)}
                        onClick={() => {
                          setOutroValor(true);
                          setForm({ ...form, valor: "" });
                        }}
                      >
                        Outro valor
                      </button>
                    </div>
                    {outroValor && (
                      <Input className="mt-3" autoFocus value={form.valor} inputMode="decimal" placeholder="R$ 150,00" onChange={(e) => setForm({ ...form, valor: e.target.value })} />
                    )}
                  </div>
                </>
              )}

              <div>
                <Label className="mb-2 block">Como quer pagar? *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["parcelado", "Parcelado"],
                    ["entrada", "Entrada + parcelas"],
                    ["avista", "À vista"],
                  ] as [Forma, string][]).map(([v, rotulo]) => (
                    <button key={v} type="button" className={botao(forma === v)} onClick={() => setForma(v)}>
                      {rotulo}
                    </button>
                  ))}
                </div>
                {forma === "entrada" && (
                  <div className="mt-3">
                    <Label className="mb-2 block text-sm">Valor da entrada (paga agora) *</Label>
                    <Input value={entrada} inputMode="decimal" placeholder="R$ 100,00" onChange={(e) => setEntrada(e.target.value)} />
                  </div>
                )}
              </div>

              {forma !== "avista" && !travado && (
                <>
                  <div>
                    <Label className="mb-2 block">{forma === "entrada" ? "O restante em quantas vezes *" : "Em quantas vezes *"}</Label>
                    <Select value={String(form.parcelas)} onValueChange={(v) => setForm({ ...form, parcelas: Number(v) })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {opcoesParcelas.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}x
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {forma !== "avista" && (
              <div>
                <Label className="mb-2 block">Melhor dia para pagar *</Label>
                <div className="grid grid-cols-5 gap-2">
                  {DIAS.map((d) => (
                    <button key={d} type="button" className={botao(form.dia === d)} onClick={() => setForm({ ...form, dia: d })}>
                      Dia {d}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[#656565]">A primeira parcela vence no mês que vem.</p>
              </div>
              )}

              {resumo && <p className="rounded-lg bg-[#f1f6ef] px-4 py-3 text-sm text-[#4f6550]">{resumo}</p>}

              <div className="flex items-start gap-3 rounded-lg border border-[#dce5d8] p-4">
                <Checkbox id="ok" checked={form.ok} onCheckedChange={(v) => setForm({ ...form, ok: v === true })} className="mt-0.5" />
                <Label htmlFor="ok" className="font-normal leading-relaxed text-[#4f6550]">
                  Autorizo ser lembrado(a) das parcelas pelo WhatsApp.
                </Label>
              </div>

              <Button type="submit" className="w-full bg-[#228B22] hover:bg-[#1a6b1a]" disabled={criar.isPending || !c}>
                {criar.isPending ? "Enviando..." : "Confirmar e ver meu carnê"}
              </Button>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}
