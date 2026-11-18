import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useRoute } from "wouter";
import { toast } from "sonner";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { linkDoCarne } from "@/lib/carne";

function quebrar(ctx: CanvasRenderingContext2D, texto: string, max: number) {
  const linhas: string[] = [];
  let atual = "";
  for (const p of texto.split(/\s+/)) {
    const t = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(t).width > max && atual) {
      linhas.push(atual);
      atual = p;
    } else atual = t;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Imagem 1080x1350 pra mandar no WhatsApp ou postar: titulo, QR e o link escrito. */
async function montarImagem(qr: string, titulo: string, subtitulo: string | null, link: string) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#228B22";
  ctx.fillRect(0, 0, W, 16);
  ctx.textAlign = "center";
  ctx.fillStyle = "#228B22";
  ctx.font = "bold 34px Inter, Arial, sans-serif";
  ctx.fillText("PARCERIA DO BEM · CARNÊ", W / 2, 110);
  ctx.fillStyle = "#1f2a22";
  ctx.font = "800 72px Inter, Arial, sans-serif";
  let y = 210;
  for (const l of quebrar(ctx, titulo, W - 140)) {
    ctx.fillText(l, W / 2, y);
    y += 84;
  }
  if (subtitulo) {
    ctx.fillStyle = "#4f6550";
    ctx.font = "600 44px Inter, Arial, sans-serif";
    ctx.fillText(subtitulo, W / 2, y + 4);
    y += 60;
  }
  const img = new Image();
  img.src = qr;
  await new Promise((r) => (img.onload = r));
  const lado = 640;
  ctx.drawImage(img, (W - lado) / 2, y + 30, lado, lado);
  ctx.fillStyle = "#1f2a22";
  ctx.font = "bold 42px Inter, Arial, sans-serif";
  ctx.fillText("Aponte a câmera do celular", W / 2, y + lado + 100);
  ctx.fillStyle = "#4f6550";
  ctx.font = "34px Inter, Arial, sans-serif";
  ctx.fillText(link, W / 2, y + lado + 152);
  return canvas.toDataURL("image/png");
}

/**
 * QR code grande da campanha rapida: pra projetar no culto, mostrar no celular ou baixar a
 * imagem e mandar no WhatsApp. Quem le cai direto no cadastro e recebe o carne digital.
 */
export default function CarnePrintPage() {
  const [, params] = useRoute("/carne/:id/qr");
  const id = Number(params?.id);
  const campanha = trpc.quickCampaigns.getPublic.useQuery({ id }, { enabled: id > 0, retry: false });
  const c = campanha.data;
  const [qr, setQr] = useState("");
  const link = linkDoCarne(id);
  const linkCurto = link.replace(/^https?:\/\/(www\.)?/, "");

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 900, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));
  }, [link]);

  async function baixar() {
    if (!c || !qr) return;
    const url = await montarImagem(qr, c.title, c.subtitle, linkCurto);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carne-${c.title.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-")}.png`;
    a.click();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não deu pra copiar.");
    }
  }

  if (campanha.error) return <p className="p-10 text-center">Campanha não encontrada.</p>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-8 text-center">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#228B22]">Parceria do Bem · Carnê</p>
      <h1 className="mt-2 text-4xl font-extrabold text-[#1f2a22] md:text-6xl">{c?.title ?? "Carregando..."}</h1>
      {c?.subtitle && <p className="mt-2 text-2xl font-semibold text-[#4f6550] md:text-3xl">{c.subtitle}</p>}
      {qr && <img src={qr} alt="QR code do carnê" className="mt-6 w-[min(52vh,80vw)] max-w-[560px]" />}
      <p className="mt-4 text-2xl font-bold text-[#1f2a22] md:text-3xl">Aponte a câmera do celular</p>
      <p className="mt-1 text-lg text-[#4f6550] md:text-xl">{linkCurto}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button type="button" className="bg-[#228B22] hover:bg-[#1a6b1a]" disabled={!c || !qr} onClick={baixar}>
          <Download className="mr-1.5 h-4 w-4" /> Baixar imagem para o WhatsApp
        </Button>
        <Button type="button" variant="outline" onClick={copiar}>
          <Copy className="mr-1.5 h-4 w-4" /> Copiar link
        </Button>
      </div>
    </div>
  );
}
