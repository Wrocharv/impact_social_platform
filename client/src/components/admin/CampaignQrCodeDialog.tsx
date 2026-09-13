import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Download, ImageDown } from "lucide-react";
import { toast } from "sonner";
import { isSameCampaignForMonthlyGiving } from "@/lib/campaignAliases";

type CampaignQrCodeDialogProps = {
  campaignId: number | null;
  campaignTitle: string;
  onClose: () => void;
};

type Destino = "campanha" | "socio";

const SITE = "https://www.parceriadobem.com.br";

// A construcao do hotel tem endereco curto proprio pro cadastro de socio doador: QR com menos
// caracteres fica menos denso (le mais facil impresso pequeno) e da pra digitar se precisar.
function urlDe(destino: Destino, campaignId: number) {
  if (destino === "campanha") return `${SITE}/campaign/${campaignId}`;
  return isSameCampaignForMonthlyGiving(campaignId, 1) ? `${SITE}/socio-doador` : `${SITE}/parceiro-mensal/${campaignId}`;
}

function carregarImagem(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function quebrarLinhas(ctx: CanvasRenderingContext2D, texto: string, larguraMax: number) {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    const teste = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(teste).width > larguraMax && atual) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = teste;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

// Cartaz pronto pra mandar no WhatsApp, postar ou imprimir: quem ve precisa entender o que e
// antes de apontar a camera — so o QR solto nao convida ninguem.
async function montarCartaz(qrDataUrl: string, chamada: string, titulo: string, url: string) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#228B22";
  ctx.fillRect(0, 0, W, 290);

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "700 38px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("PARCERIA DO BEM", W / 2, 95);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 74px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(chamada, W / 2, 200);

  ctx.fillStyle = "#1c2b1f";
  ctx.font = "700 50px system-ui, -apple-system, 'Segoe UI', sans-serif";
  quebrarLinhas(ctx, titulo, W - 160)
    .slice(0, 2)
    .forEach((linha, i) => ctx.fillText(linha, W / 2, 375 + i * 62));

  const qr = await carregarImagem(qrDataUrl);
  const tamanho = 640;
  ctx.drawImage(qr, (W - tamanho) / 2, 490, tamanho, tamanho);

  ctx.fillStyle = "#4f6550";
  ctx.font = "600 40px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("Aponte a câmera do celular", W / 2, 1200);
  ctx.font = "400 32px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(url.replace(/^https:\/\/www\./, ""), W / 2, 1262);

  return canvas.toDataURL("image/png");
}

const nomeArquivo = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export default function CampaignQrCodeDialog({ campaignId, campaignTitle, onClose }: CampaignQrCodeDialogProps) {
  const [destino, setDestino] = useState<Destino>("socio");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [cartazDataUrl, setCartazDataUrl] = useState<string | null>(null);
  const url = campaignId ? urlDe(destino, campaignId) : "";
  const chamada = destino === "socio" ? "SEJA SÓCIO DOADOR" : "CONHEÇA A CAMPANHA";

  useEffect(() => {
    if (!campaignId) {
      setQrDataUrl(null);
      setCartazDataUrl(null);
      return;
    }
    let cancelado = false;
    setQrDataUrl(null);
    setCartazDataUrl(null);
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#1c2b1f", light: "#ffffff" } })
      .then(async (qr) => {
        if (cancelado) return;
        setQrDataUrl(qr);
        const cartaz = await montarCartaz(qr, chamada, campaignTitle, url);
        if (!cancelado) setCartazDataUrl(cartaz);
      })
      .catch(() => !cancelado && setQrDataUrl(null));
    return () => {
      cancelado = true;
    };
  }, [campaignId, url, chamada, campaignTitle]);

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o endereço abaixo do QR.");
    }
  }

  const base = `${destino === "socio" ? "socio-doador" : "campanha"}-${nomeArquivo(campaignTitle)}`;

  return (
    <Dialog open={campaignId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader>
          <DialogTitle>QR Code — {campaignTitle}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {([
            ["socio", "Cadastro de sócio doador"],
            ["campanha", "Página da campanha"],
          ] as const).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setDestino(valor)}
              className={`min-h-11 rounded-md border px-2 text-sm font-semibold transition ${
                destino === valor ? "border-[#228B22] bg-[#228B22] text-white" : "border-[#dce5d8] bg-white text-[#4f6550] hover:border-[#228B22]"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <p className="text-xs text-[#66736a]">
          {destino === "socio"
            ? "Quem ler cai direto no formulário de sócio doador, sem precisar navegar pelo site."
            : "Quem ler abre a página da campanha."}
        </p>

        {qrDataUrl ? (
          <>
            <img src={qrDataUrl} alt={`QR Code — ${campaignTitle}`} className="mx-auto w-full max-w-[260px] rounded-lg border border-[#e1e6df]" />
            <button type="button" onClick={copiarLink} className="mx-auto inline-flex items-center gap-1.5 break-all text-xs text-[#4f6550] underline">
              <Copy className="h-3.5 w-3.5 shrink-0" /> {url}
            </button>
            <div className="grid gap-2">
              <a
                href={cartazDataUrl ?? undefined}
                download={`cartaz-${base}.png`}
                aria-disabled={!cartazDataUrl}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#228B22] px-6 font-semibold text-white hover:bg-[#1a6b1a] ${
                  cartazDataUrl ? "" : "pointer-events-none opacity-60"
                }`}
              >
                <ImageDown className="h-4 w-4" /> Baixar cartaz para divulgar
              </a>
              <a
                href={qrDataUrl}
                download={`qrcode-${base}.png`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#228B22] px-6 font-semibold text-[#228B22] hover:bg-[#228B22]/5"
              >
                <Download className="h-4 w-4" /> Baixar só o QR Code
              </a>
            </div>
          </>
        ) : (
          <p className="text-sm text-[#66736a]">Gerando QR Code...</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
