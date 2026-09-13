import { useMemo, useState } from "react";
import { HeartHandshake, MessageCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { trpc } from "@/lib/trpc";

type Linha = inferRouterOutputs<AppRouter>["monthlyPledges"]["painel"][number];
type Filtro = "atencao" | "ativos" | "atrasado" | "em_dia" | "concluido" | "inativos";
type Metodo = "pix" | "dinheiro" | "transferencia" | "cartao" | "outro";

const METODOS: [Metodo, string][] = [
  ["pix", "Pix"],
  ["dinheiro", "Dinheiro"],
  ["transferencia", "Transferência"],
  ["cartao", "Cartão"],
  ["outro", "Outro"],
];

const ORDEM: Record<Linha["situacao"]["categoria"], number> = {
  atrasado: 0,
  vence_logo: 1,
  em_dia: 2,
  pausado: 3,
  concluido: 4,
  cancelado: 5,
};

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const hojeBrasil = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const ddmmaaaa = (iso: string) => `${ddmm(iso)}/${iso.slice(0, 4)}`;

function diaMes(valor: unknown) {
  if (!valor) return null;
  const d = new Date(valor as string);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

function numeroWhatsApp(whatsapp: string) {
  const d = whatsapp.replace(/\D/g, "");
  return d.length <= 11 ? `55${d}` : d;
}

// "100", "100,50", "1.000,00" e "100.50" viram centavos certos.
function paraCentavos(valor: string) {
  const limpo = valor.trim().replace(/[^\d.,]/g, "");
  if (!limpo) return null;
  const numero = limpo.includes(",") ? Number(limpo.replace(/\./g, "").replace(",", ".")) : Number(limpo);
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) : null;
}

// Mensagem pronta, no tom de lembrete e nao de cobranca: o compromisso e voluntario.
function mensagemLembrete(l: Linha) {
  const primeiro = l.fullName.trim().split(/\s+/)[0];
  const s = l.situacao;
  const fim = "Quando fizer, é só responder aqui com o comprovante. Obrigado por fazer parte!";
  if (s.categoria === "atrasado") {
    const aberto =
      s.atrasadas === 1
        ? `Consta 1 parcela em aberto (${brl(l.installmentAmountCents)}), que venceu dia ${ddmm(s.primeiraEmAberto)}.`
        : `Constam ${s.atrasadas} parcelas em aberto, de ${brl(l.installmentAmountCents)} cada (${brl(s.valorAtrasadoCents)} no total).`;
    return `Olá, ${primeiro}! Tudo bem? Passando pra lembrar do seu compromisso de sócio doador com a campanha "${l.campaignTitle}". ${aberto} ${fim}`;
  }
  const vence = s.primeiraEmAberto ? ` vence dia ${ddmm(s.primeiraEmAberto)}` : "";
  return `Olá, ${primeiro}! Tudo bem? Passando pra lembrar que a parcela ${s.parcelasPagas + 1} de ${l.installments} (${brl(l.installmentAmountCents)}) do seu compromisso de sócio doador com a campanha "${l.campaignTitle}"${vence}. ${fim}`;
}

function Situacao({ l }: { l: Linha }) {
  const s = l.situacao;
  const [classe, texto] =
    s.categoria === "atrasado"
      ? ["bg-red-100 text-red-800", s.atrasadas === 1 ? "Atrasado · 1 parcela" : `Atrasado · ${s.atrasadas} parcelas`]
      : s.categoria === "vence_logo"
        ? ["bg-amber-100 text-amber-800", `Vence ${ddmm(s.primeiraEmAberto)}`]
        : s.categoria === "em_dia"
          ? ["bg-green-100 text-green-800", s.primeiraEmAberto ? `Em dia · próxima ${ddmm(s.primeiraEmAberto)}` : "Em dia"]
          : s.categoria === "concluido"
            ? ["bg-[#228B22] text-white", "Concluído"]
            : s.categoria === "pausado"
              ? ["bg-gray-100 text-gray-700", "Pausado"]
              : ["bg-gray-100 text-gray-500", "Cancelado"];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${classe}`}>{texto}</span>;
}

/**
 * Onde se administra o socio doador no dia a dia: quem lembrar, quem esta atrasado, o que foi
 * recebido. Separado do relatorio geral de doacoes de proposito — aqui o assunto e o compromisso
 * mensal de cada pessoa, parcela a parcela.
 */
export default function MonthlyPledgesSection() {
  const utils = trpc.useUtils();
  const painel = trpc.monthlyPledges.painel.useQuery();
  const atualizar = async () => {
    await Promise.all([utils.monthlyPledges.painel.invalidate(), utils.monthlyPledges.list.invalidate()]);
  };
  const erro = (e: { message: string }) => toast.error(e.message || "Não foi possível fazer isso agora.");

  const [filtro, setFiltro] = useState<Filtro>("atencao");
  const [campanha, setCampanha] = useState("todas");
  const [busca, setBusca] = useState("");
  const [recebendo, setRecebendo] = useState<{ id: number; valor: string; data: string; metodo: Metodo; obs: string } | null>(null);
  const [abertos, setAbertos] = useState<Set<number>>(new Set());

  const registrar = trpc.monthlyPledges.registrarPagamento.useMutation({
    onSuccess: async () => {
      toast.success("Pagamento registrado.");
      setRecebendo(null);
      await atualizar();
    },
    onError: erro,
  });
  const remover = trpc.monthlyPledges.removerPagamento.useMutation({ onSuccess: atualizar, onError: erro });
  const lembrado = trpc.monthlyPledges.marcarLembrado.useMutation({ onSuccess: atualizar, onError: erro });
  const mudarStatus = trpc.monthlyPledges.updateStatus.useMutation({ onSuccess: atualizar, onError: erro });

  const linhas = painel.data ?? [];
  const campanhas = useMemo(() => Array.from(new Map(linhas.map((l) => [l.campaignId, l.campaignTitle])).entries()), [linhas]);
  const daCampanha = linhas.filter((l) => campanha === "todas" || String(l.campaignId) === campanha);
  const deCategoria = (...cats: Linha["situacao"]["categoria"][]) => daCampanha.filter((l) => cats.includes(l.situacao.categoria));

  const atrasados = deCategoria("atrasado");
  const venceLogo = deCategoria("vence_logo");
  const emDia = deCategoria("vence_logo", "em_dia");
  const ativos = deCategoria("atrasado", "vence_logo", "em_dia");
  const mes = hojeBrasil().slice(0, 7);
  const recebidoNoMes = daCampanha.reduce(
    (soma, l) => soma + l.pagamentos.filter((p) => p.paidOn.startsWith(mes)).reduce((s, p) => s + p.amountCents, 0),
    0,
  );

  const termo = busca.trim().toLowerCase();
  const visiveis = daCampanha
    .filter((l) => {
      const c = l.situacao.categoria;
      if (filtro === "atencao") return c === "atrasado" || c === "vence_logo";
      if (filtro === "ativos") return c === "atrasado" || c === "vence_logo" || c === "em_dia";
      if (filtro === "atrasado") return c === "atrasado";
      if (filtro === "em_dia") return c === "em_dia" || c === "vence_logo";
      if (filtro === "concluido") return c === "concluido";
      return c === "pausado" || c === "cancelado";
    })
    .filter((l) => !termo || l.fullName.toLowerCase().includes(termo) || l.whatsapp.replace(/\D/g, "").includes(termo.replace(/\D/g, "") || "#"))
    .sort(
      (a, b) =>
        ORDEM[a.situacao.categoria] - ORDEM[b.situacao.categoria] ||
        (a.situacao.primeiraEmAberto ?? "9").localeCompare(b.situacao.primeiraEmAberto ?? "9"),
    );

  function lembrar(l: Linha) {
    // Abre o WhatsApp no proprio clique: depois de um await o navegador bloqueia a janela.
    window.open(`https://wa.me/${numeroWhatsApp(l.whatsapp)}?text=${encodeURIComponent(mensagemLembrete(l))}`, "_blank", "noopener,noreferrer");
    lembrado.mutate({ id: l.id });
  }

  function abrirRecebimento(l: Linha) {
    setRecebendo({
      id: l.id,
      valor: (l.installmentAmountCents / 100).toFixed(2).replace(".", ","),
      data: hojeBrasil(),
      metodo: "pix",
      obs: "",
    });
  }

  function salvarRecebimento() {
    if (!recebendo) return;
    const amountCents = paraCentavos(recebendo.valor);
    if (!amountCents) {
      toast.error("Informe o valor recebido.");
      return;
    }
    registrar.mutate({
      pledgeId: recebendo.id,
      amountCents,
      paidOn: recebendo.data,
      method: recebendo.metodo,
      note: recebendo.obs.trim() || undefined,
    });
  }

  function alternar(id: number) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const resumo = [
    { rotulo: "Atrasados", valor: String(atrasados.length), extra: brl(atrasados.reduce((s, l) => s + l.situacao.valorAtrasadoCents, 0)) + " em aberto", cor: "text-red-700", filtro: "atrasado" as Filtro },
    { rotulo: "Lembrar esta semana", valor: String(venceLogo.length), extra: "vencem nos próximos 7 dias", cor: "text-amber-700", filtro: "atencao" as Filtro },
    { rotulo: "Em dia", valor: String(emDia.length), extra: `${brl(ativos.reduce((s, l) => s + l.installmentAmountCents, 0))} por mês`, cor: "text-[#228B22]", filtro: "em_dia" as Filtro },
    { rotulo: "Recebido este mês", valor: brl(recebidoNoMes), extra: `${ativos.length} sócios ativos`, cor: "text-[#243128]", filtro: "ativos" as Filtro },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#228B22]/10">
            <HeartHandshake className="h-5 w-5 text-[#228B22]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#243128]">Sócios doadores</h1>
            <p className="text-sm text-[#66736a]">Quem lembrar, quem está em dia e o que já foi recebido de cada compromisso mensal.</p>
          </div>
        </div>
        {campanhas.length > 1 && (
          <Select value={campanha} onValueChange={setCampanha}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as campanhas</SelectItem>
              {campanhas.map(([id, titulo]) => (
                <SelectItem key={id} value={String(id)}>
                  {titulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {resumo.map((r) => (
          <button key={r.rotulo} type="button" onClick={() => setFiltro(r.filtro)} className="text-left">
            <Card className={`p-4 transition hover:border-[#228B22] ${filtro === r.filtro ? "border-[#228B22]" : ""}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-[#8a9488]">{r.rotulo}</p>
              <p className={`mt-1 text-2xl font-bold ${r.cor}`}>{r.valor}</p>
              <p className="text-xs text-[#66736a]">{r.extra}</p>
            </Card>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([
          ["atencao", "Precisa de atenção"],
          ["ativos", "Todos os ativos"],
          ["atrasado", "Atrasados"],
          ["em_dia", "Em dia"],
          ["concluido", "Concluídos"],
          ["inativos", "Pausados e cancelados"],
        ] as [Filtro, string][]).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setFiltro(valor)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              filtro === valor ? "border-[#228B22] bg-[#228B22] text-white" : "border-[#dce5d8] bg-white text-[#4f6550] hover:border-[#228B22]"
            }`}
          >
            {rotulo}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-60">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9488]" />
          <Input className="pl-9" placeholder="Buscar nome ou WhatsApp" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {painel.isLoading ? (
        <p className="py-10 text-center text-sm text-[#66736a]">Carregando sócios doadores...</p>
      ) : visiveis.length === 0 ? (
        <Card className="p-8 text-center text-sm text-[#66736a]">
          {linhas.length === 0
            ? "Nenhum sócio doador cadastrado ainda. O cadastro público fica em parceriadobem.com.br/socio-doador."
            : filtro === "atencao"
              ? "Ninguém atrasado e ninguém vencendo nos próximos 7 dias."
              : "Ninguém nesse filtro."}
        </Card>
      ) : (
        <div className="space-y-3">
          {visiveis.map((l) => {
            const s = l.situacao;
            const ativo = s.categoria === "atrasado" || s.categoria === "vence_logo" || s.categoria === "em_dia";
            const aberto = abertos.has(l.id);
            const ultimoLembrete = diaMes(l.lastReminderAt);
            return (
              <Card key={l.id} className={`p-4 ${s.categoria === "atrasado" ? "border-red-200" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-[#243128]">{l.fullName}</p>
                      <Situacao l={l} />
                    </div>
                    <p className="mt-1 text-sm text-[#66736a]">
                      {l.campaignTitle} · WhatsApp {l.whatsapp}
                      {l.city ? ` · ${l.city}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-[#66736a]">
                      {brl(l.installmentAmountCents)} por mês, todo dia {l.reminderDay} · {s.parcelasPagas} de {l.installments} parcelas ·{" "}
                      {brl(s.totalPagoCents)} de {brl(l.totalAmountCents)}
                    </p>
                    {s.categoria === "atrasado" && (
                      <p className="mt-1 text-sm font-semibold text-red-700">
                        Em aberto: {brl(s.valorAtrasadoCents)} (desde {ddmm(s.primeiraEmAberto)})
                      </p>
                    )}
                    <p className="mt-1 text-xs text-[#8a9488]">
                      {ultimoLembrete ? `Lembrado em ${ultimoLembrete}` : "Ainda não foi lembrado"}
                      {l.pagamentos[0] ? ` · último pagamento em ${ddmmaaaa(l.pagamentos[0].paidOn)}` : " · nenhum pagamento registrado"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {ativo && (
                      <Button type="button" size="sm" variant="outline" className="border-[#228B22] text-[#228B22]" onClick={() => lembrar(l)}>
                        <MessageCircle className="mr-1.5 h-4 w-4" /> Lembrar
                      </Button>
                    )}
                    {s.categoria !== "cancelado" && s.categoria !== "concluido" && (
                      <Button type="button" size="sm" className="bg-[#228B22] hover:bg-[#1a6b1a]" onClick={() => abrirRecebimento(l)}>
                        Recebi
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => alternar(l.id)}>
                      {aberto ? "Fechar" : `Histórico (${l.pagamentos.length})`}
                    </Button>
                  </div>
                </div>

                {recebendo?.id === l.id && (
                  <div className="mt-4 rounded-lg border border-[#dce5d8] bg-[#f8fbf6] p-4">
                    <p className="mb-3 text-sm font-bold text-[#243128]">Registrar pagamento recebido</p>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <label className="text-xs font-medium text-[#55645a]">
                        Valor
                        <Input className="mt-1" inputMode="decimal" value={recebendo.valor} onChange={(e) => setRecebendo({ ...recebendo, valor: e.target.value })} />
                      </label>
                      <label className="text-xs font-medium text-[#55645a]">
                        Data
                        <Input className="mt-1" type="date" value={recebendo.data} onChange={(e) => setRecebendo({ ...recebendo, data: e.target.value })} />
                      </label>
                      <label className="text-xs font-medium text-[#55645a]">
                        Forma
                        <Select value={recebendo.metodo} onValueChange={(v) => setRecebendo({ ...recebendo, metodo: v as Metodo })}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {METODOS.map(([valor, rotulo]) => (
                              <SelectItem key={valor} value={valor}>
                                {rotulo}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="text-xs font-medium text-[#55645a]">
                        Observação
                        <Input className="mt-1" placeholder="opcional" value={recebendo.obs} onChange={(e) => setRecebendo({ ...recebendo, obs: e.target.value })} />
                      </label>
                    </div>
                    {s.categoria === "atrasado" && s.atrasadas > 1 && (
                      <button
                        type="button"
                        onClick={() => setRecebendo({ ...recebendo, valor: (s.valorAtrasadoCents / 100).toFixed(2).replace(".", ",") })}
                        className="mt-2 text-xs font-semibold text-[#228B22] underline"
                      >
                        Pagou tudo que estava em aberto ({brl(s.valorAtrasadoCents)})
                      </button>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button type="button" size="sm" className="bg-[#228B22] hover:bg-[#1a6b1a]" disabled={registrar.isPending} onClick={salvarRecebimento}>
                        {registrar.isPending ? "Salvando..." : "Salvar pagamento"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setRecebendo(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {aberto && (
                  <div className="mt-4 border-t border-[#e1e6df] pt-3">
                    {l.pagamentos.length === 0 ? (
                      <p className="text-sm text-[#66736a]">Nenhum pagamento registrado ainda.</p>
                    ) : (
                      <ul className="divide-y divide-[#eef2ec]">
                        {l.pagamentos.map((p) => (
                          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                            <span className="text-[#243128]">
                              <strong>{ddmmaaaa(p.paidOn)}</strong> · {brl(p.amountCents)} · {METODOS.find(([v]) => v === p.method)?.[1] ?? p.method}
                              {p.note ? <span className="text-[#66736a]"> · {p.note}</span> : null}
                              {p.recordedBy ? <span className="text-xs text-[#8a9488]"> · registrado por {p.recordedBy}</span> : null}
                            </span>
                            <button
                              type="button"
                              disabled={remover.isPending}
                              onClick={() => window.confirm(`Apagar o pagamento de ${brl(p.amountCents)} em ${ddmmaaaa(p.paidOn)}?`) && remover.mutate({ id: p.id })}
                              className="text-xs text-red-700 underline"
                            >
                              apagar
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(s.categoria === "atrasado" || s.categoria === "vence_logo" || s.categoria === "em_dia") && (
                        <Button type="button" size="sm" variant="outline" disabled={mudarStatus.isPending} onClick={() => mudarStatus.mutate({ id: l.id, status: "paused" })}>
                          Pausar
                        </Button>
                      )}
                      {(s.categoria === "pausado" || s.categoria === "cancelado") && (
                        <Button type="button" size="sm" variant="outline" disabled={mudarStatus.isPending} onClick={() => mudarStatus.mutate({ id: l.id, status: "active" })}>
                          Reativar
                        </Button>
                      )}
                      {s.categoria !== "cancelado" && s.categoria !== "concluido" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-red-700 hover:text-red-800"
                          disabled={mudarStatus.isPending}
                          onClick={() => window.confirm(`Cancelar o compromisso de ${l.fullName}?`) && mudarStatus.mutate({ id: l.id, status: "cancelled" })}
                        >
                          Cancelar compromisso
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
