// Pecas comuns do carne (campanhas rapidas): impresso, cadastro e mensagem do WhatsApp.

export const SITE = "https://www.parceriadobem.com.br";

export const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const linkDoCarne = (id: number) => `${SITE}/carne/${id}`;

/** "100", "100,50", "1.000,00" e "100.50" viram centavos. */
export function paraCentavos(valor: string) {
  const limpo = valor.trim().replace(/[^\d.,]/g, "");
  if (!limpo) return null;
  const numero = limpo.includes(",") ? Number(limpo.replace(/\./g, "").replace(",", ".")) : Number(limpo);
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) : null;
}

export const centavosParaCampo = (cents: number | null | undefined) => (cents ? (cents / 100).toFixed(2).replace(".", ",") : "");

/** Vencimentos a partir do mes que vem, no dia escolhido (mes curto cai no ultimo dia). Igual ao servidor. */
export function vencimentosDesdeHoje(parcelas: number, dia: number, hoje = new Date()) {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(hoje)
    .split("-")
    .map(Number);
  return Array.from({ length: parcelas }, (_, i) => {
    const total = mes + i; // (mes - 1) + 1 + i
    const a = ano + Math.floor(total / 12);
    const m = (total % 12) + 1;
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return `${a}-${String(m).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
  });
}

export const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Carne digital: a mensagem que a pessoa recebe no WhatsApp com todas as parcelas. */
export function mensagemCarne(p: {
  nome: string;
  campanha: string;
  parcelaCents: number;
  vencimentos: string[];
  pagas: number;
  entradaCents?: number;
  entradaPaga?: boolean;
  pixKey?: string | null;
  pixName?: string | null;
}) {
  const primeiro = p.nome.trim().split(/\s+/)[0];
  const linhas = p.vencimentos.map(
    (v, i) => `${i < p.pagas ? "✅" : "⬜"} ${String(i + 1).padStart(2, "0")}/${String(p.vencimentos.length).padStart(2, "0")} · ${ddmmaaaa(v)} · ${brl(p.parcelaCents)}`,
  );
  if (p.entradaCents) linhas.unshift(`${p.entradaPaga ? "✅" : "⬜"} ${p.vencimentos.length ? "Entrada" : "À vista"} · ${brl(p.entradaCents)}`);
  const pix = p.pixKey ? `\n\nPix: ${p.pixKey}${p.pixName ? ` (${p.pixName})` : ""}` : "";
  return `Olá, ${primeiro}! Segue o seu carnê da campanha "${p.campanha}":\n\n${linhas.join("\n")}${pix}\n\nDepois de pagar, é só mandar o comprovante aqui. Deus abençoe!`;
}
