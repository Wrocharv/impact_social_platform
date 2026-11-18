import { useState } from "react";
import { Copy, MessageCircle, Pencil, Plus, QrCode, Ticket } from "lucide-react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { brl, centavosParaCampo, linkDoCarne, paraCentavos } from "@/lib/carne";

type Campanha = inferRouterOutputs<AppRouter>["quickCampaigns"]["list"][number];

const VAZIO = { id: 0, title: "", subtitle: "", meta: "", valor: "", parcelas: "", livre: true, pixKey: "", pixName: "" };
type Form = typeof VAZIO;

/** Campanhas rapidas (carnes): poltronas, som, telhado de uma congregacao. Nao aparecem no site. */
export default function QuickCampaignsSection() {
  const utils = trpc.useUtils();
  const lista = trpc.quickCampaigns.list.useQuery();
  const ultimoPix = trpc.quickCampaigns.ultimoPix.useQuery();
  const [form, setForm] = useState<Form | null>(null);
  const [verEncerradas, setVerEncerradas] = useState(false);

  const atualizar = () => Promise.all([utils.quickCampaigns.list.invalidate(), utils.monthlyPledges.painel.invalidate()]);
  const erro = (e: { message: string }) => toast.error(e.message || "Não foi possível salvar.");
  const criar = trpc.quickCampaigns.create.useMutation({
    onSuccess: async () => {
      toast.success("Campanha criada. Já pode mostrar o QR code ou mandar o link.");
      setForm(null);
      await atualizar();
    },
    onError: erro,
  });
  const editar = trpc.quickCampaigns.update.useMutation({
    onSuccess: async () => {
      toast.success("Campanha atualizada.");
      setForm(null);
      await atualizar();
    },
    onError: erro,
  });
  const status = trpc.quickCampaigns.setStatus.useMutation({ onSuccess: atualizar, onError: erro });

  function nova() {
    setForm({ ...VAZIO, pixKey: ultimoPix.data?.pixKey ?? "", pixName: ultimoPix.data?.pixName ?? "" });
  }

  function abrirEdicao(c: Campanha) {
    setForm({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle ?? "",
      meta: centavosParaCampo(c.goalCents),
      valor: centavosParaCampo(c.suggestedTotalCents),
      parcelas: c.suggestedInstallments ? String(c.suggestedInstallments) : "",
      livre: c.allowCustomAmount,
      pixKey: c.pixKey ?? "",
      pixName: c.pixName ?? "",
    });
  }

  function salvar() {
    if (!form) return;
    const parcelas = Number(form.parcelas) || null;
    const valor = paraCentavos(form.valor);
    if (!form.livre && (!valor || !parcelas)) {
      toast.error("Para travar o valor, informe o valor total e as parcelas.");
      return;
    }
    const dados = {
      title: form.title,
      subtitle: form.subtitle,
      goalCents: paraCentavos(form.meta),
      suggestedTotalCents: valor,
      suggestedInstallments: parcelas,
      allowCustomAmount: form.livre,
      pixKey: form.pixKey,
      pixName: form.pixName,
    };
    if (form.id) editar.mutate({ id: form.id, ...dados });
    else criar.mutate(dados);
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não deu pra copiar.");
    }
  }

  function divulgar(c: Campanha) {
    const texto = `${c.title}${c.subtitle ? ` – ${c.subtitle}` : ""}\n\nFaça seu compromisso e receba o seu carnê aqui: ${linkDoCarne(c.id)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  }

  const todas = lista.data ?? [];
  const visiveis = todas.filter((c) => verEncerradas || c.status === "active");
  const encerradas = todas.length - todas.filter((c) => c.status === "active").length;
  const campo = (rotulo: string, chave: keyof Form, extra: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <label className="text-xs font-medium text-[#55645a]">
      {rotulo}
      <Input className="mt-1" value={String(form?.[chave] ?? "")} onChange={(e) => setForm((f) => f && { ...f, [chave]: e.target.value })} {...extra} />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#228B22]/10">
            <Ticket className="h-5 w-5 text-[#228B22]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#243128]">Campanhas rápidas (carnês)</h2>
            <p className="text-sm text-[#66736a]">Poltronas, som, telhado... Não aparecem no site — só quem lê o QR do carnê chega no cadastro.</p>
          </div>
        </div>
        {!form && (
          <Button type="button" className="bg-[#228B22] hover:bg-[#1a6b1a]" onClick={nova}>
            <Plus className="mr-1.5 h-4 w-4" /> Nova campanha rápida
          </Button>
        )}
      </div>

      {form && (
        <Card className="space-y-4 border-[#228B22] p-5">
          <p className="font-bold text-[#243128]">{form.id ? "Editar campanha" : "Nova campanha rápida"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {campo("Nome da campanha *", "title", { placeholder: "Compra de poltronas" })}
            {campo("Congregação / detalhe", "subtitle", { placeholder: "Congregação Vila Nova" })}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {campo("Meta (R$)", "meta", { placeholder: "15.000,00", inputMode: "decimal" })}
            {campo("Valor sugerido por pessoa (R$)", "valor", { placeholder: "300,00", inputMode: "decimal" })}
            {campo("Em quantas parcelas", "parcelas", { placeholder: "10", inputMode: "numeric" })}
          </div>
          <label className="flex items-center gap-2 text-sm text-[#4f6550]">
            <Checkbox checked={form.livre} onCheckedChange={(v) => setForm({ ...form, livre: v === true })} />
            A pessoa pode mudar o valor e as parcelas no cadastro
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {campo("Chave Pix", "pixKey", { placeholder: "CNPJ, e-mail ou telefone" })}
            {campo("Nome que aparece no Pix", "pixName", { placeholder: "Igreja Assembleia de Deus" })}
          </div>
          <div className="flex gap-2">
            <Button type="button" className="bg-[#228B22] hover:bg-[#1a6b1a]" disabled={criar.isPending || editar.isPending} onClick={salvar}>
              {criar.isPending || editar.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {lista.isLoading ? (
        <p className="py-6 text-center text-sm text-[#66736a]">Carregando campanhas...</p>
      ) : visiveis.length === 0 && !form ? (
        <Card className="p-6 text-center text-sm text-[#66736a]">Nenhuma campanha rápida ainda. Crie uma e mostre o QR code ou mande o link.</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visiveis.map((c) => {
            const progresso = c.goalCents ? Math.min(100, Math.round((c.pagoCents / c.goalCents) * 100)) : null;
            return (
              <Card key={c.id} className={`p-5 ${c.status === "closed" ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-[#243128]">{c.title}</p>
                    {c.subtitle && <p className="text-sm text-[#66736a]">{c.subtitle}</p>}
                  </div>
                  {c.status === "closed" && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">Encerrada</span>}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Prometido", brl(c.prometidoCents), "text-[#243128]"],
                    ["Arrecadado", brl(c.pagoCents), "text-[#228B22]"],
                    ["A receber", brl(c.aPagarCents), "text-[#243128]"],
                    ["Atrasado", brl(c.atrasadoCents), c.atrasadoCents ? "text-red-700" : "text-[#8a9488]"],
                  ].map(([rotulo, valor, cor]) => (
                    <div key={rotulo}>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-[#8a9488]">{rotulo}</p>
                      <p className={`font-bold ${cor}`}>{valor}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[#66736a]">
                  Arrecadado = entradas e à vista {brl(c.entradasRecebidasCents)} + parcelas {brl(c.parcelasRecebidasCents)}
                  {c.entradasPendentesCents ? ` · entradas ainda não pagas: ${brl(c.entradasPendentesCents)}` : ""}
                </p>
                {progresso !== null && (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-[#e7eee4]">
                      <div className="h-full bg-[#228B22]" style={{ width: `${progresso}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-[#66736a]">
                      {progresso}% da meta de {brl(c.goalCents!)} já pago
                    </p>
                  </div>
                )}
                <p className="mt-2 text-xs text-[#66736a]">
                  {c.pessoas} {c.pessoas === 1 ? "pessoa" : "pessoas"} · {c.atrasados} com parcela atrasada · {c.concluidos} já quitaram
                  {c.suggestedTotalCents ? ` · sugerido ${brl(c.suggestedTotalCents)}${c.suggestedInstallments ? ` em ${c.suggestedInstallments}x` : ""}` : ""}
                  {!c.allowCustomAmount ? " (valor fixo)" : ""}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" size="sm" className="bg-[#228B22] hover:bg-[#1a6b1a]" onClick={() => window.open(`/carne/${c.id}/qr`, "_blank")}>
                    <QrCode className="mr-1.5 h-4 w-4" /> QR code
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => divulgar(c)}>
                    <MessageCircle className="mr-1.5 h-4 w-4" /> Mandar link
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => copiar(linkDoCarne(c.id))}>
                    <Copy className="mr-1.5 h-4 w-4" /> Copiar link
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => abrirEdicao(c)}>
                    <Pencil className="mr-1.5 h-4 w-4" /> Editar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={status.isPending}
                    onClick={() =>
                      c.status === "active"
                        ? window.confirm(`Encerrar "${c.title}"? Ninguém novo consegue se cadastrar, mas os pagamentos continuam sendo registrados.`) &&
                          status.mutate({ id: c.id, status: "closed" })
                        : status.mutate({ id: c.id, status: "active" })
                    }
                  >
                    {c.status === "active" ? "Encerrar" : "Reabrir"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {encerradas > 0 && (
        <button type="button" className="text-sm font-semibold text-[#228B22] underline" onClick={() => setVerEncerradas((v) => !v)}>
          {verEncerradas ? "Esconder encerradas" : `Ver encerradas (${encerradas})`}
        </button>
      )}
    </div>
  );
}
