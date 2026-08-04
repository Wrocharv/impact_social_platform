import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ExternalLink, Handshake, Instagram, MessageCircle, Store } from "lucide-react";
import { Link, useRoute } from "wouter";

type PartnerVideoSource =
  | { kind: "embed"; src: string }
  | { kind: "file"; src: string; mimeType: string };

function normalizeWhatsapp(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

function normalizeInstagram(partner: { website?: string | null; contactInfo?: string | null }) {
  if (partner.website && partner.website.toLowerCase().includes("instagram.com")) {
    return partner.website;
  }

  const contact = partner.contactInfo?.trim();
  if (!contact) return null;
  if (contact.startsWith("@") && contact.length > 1) {
    return `https://instagram.com/${contact.slice(1)}`;
  }

  return null;
}

function toEmbedVideoUrl(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes("youtu.be")) {
      const id = parsed.pathname.replace(/^\//, "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/embed/")) return parsed.toString();
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).at(-1);
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }

    return null;
  } catch {
    return null;
  }
}

function toPartnerVideoSource(url?: string | null): PartnerVideoSource | null {
  if (!url) return null;

  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;

  if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(trimmedUrl)) {
    const lower = trimmedUrl.toLowerCase();
    const mimeType = lower.includes(".webm")
      ? "video/webm"
      : lower.includes(".ogg")
        ? "video/ogg"
        : "video/mp4";

    return { kind: "file", src: trimmedUrl, mimeType };
  }

  const embedded = toEmbedVideoUrl(trimmedUrl);
  if (!embedded) return null;

  return { kind: "embed", src: embedded };
}

function getCustomPartnerBanner(name?: string | null) {
  if (!name) return null;

  const normalizedName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalizedName.includes("predimais")) {
    return "/Parceiros/Banner_APredimais_Saulo_Goulart.png";
  }

  if (normalizedName.includes("multipla escolha")) {
    return "/Parceiros/Banner_MultiplaEscolha_LucasSardinha.png";
  }

  return null;
}

function getCustomPartnerLogo(name?: string | null) {
  if (!name) return null;

  const normalizedName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalizedName.includes("predimais")) {
    return "/partners/predimais.jpeg";
  }

  if (normalizedName.includes("multipla escolha")) {
    return "/partners/multipla-escolha.png";
  }

  return null;
}

function getCustomPartnerVideo(name?: string | null) {
  if (!name) return null;

  const normalizedName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalizedName === "a predimais" || normalizedName.includes("predimais")) {
    return "/Parceiros/WhatsApp Video 2026-07-28 at 15.37.04.mp4";
  }

  if (normalizedName.includes("multipla escolha")) {
    return "/Parceiros/Video_Multipla_Escolha.MOV";
  }

  return null;
}

function getFallbackPartnerWebsite(name?: string | null) {
  if (!name) return null;

  const normalizedName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalizedName.includes("multipla escolha")) {
    return "https://www.parceriadobem.com.br";
  }

  return null;
}

export default function PartnerSpotlightPage() {
  const [, params] = useRoute("/partner/:id");
  const partnerId = Number(params?.id ?? 0);

  const partnerQuery = trpc.partners.getPublicById.useQuery(
    { id: partnerId },
    { enabled: Number.isInteger(partnerId) && partnerId > 0 },
  );

  if (!Number.isInteger(partnerId) || partnerId <= 0) {
    return <PartnerState title="Parceiro inválido" description="O endereço informado não corresponde a um parceiro." />;
  }

  if (partnerQuery.isLoading) {
    return <PartnerState title="Carregando parceiro" description="Estamos preparando a vitrine deste parceiro." />;
  }

  if (partnerQuery.isError) {
    return <PartnerState title="Falha ao carregar" description="Não foi possível carregar a página deste parceiro agora." />;
  }

  const partner = partnerQuery.data;
  if (!partner) {
    return <PartnerState title="Parceiro não encontrado" description="Esse parceiro pode ter sido removido ou ainda não publicado." />;
  }

  const partnerWebsiteUrl = partner.website || getFallbackPartnerWebsite(partner.name);
  const whatsappUrl = normalizeWhatsapp(partner.contactInfo);
  const instagramUrl = normalizeInstagram({
    website: partnerWebsiteUrl,
    contactInfo: partner.contactInfo,
  });
  const customVideoUrl = getCustomPartnerVideo(partner.name);
  const videoSource = toPartnerVideoSource(customVideoUrl || partner.testimonialVideoUrl);
  const customBannerUrl = getCustomPartnerBanner(partner.name);
  const customLogoUrl = getCustomPartnerLogo(partner.name);
  const showFullWidthBanner = Boolean(customBannerUrl);
  const featuredImage = customBannerUrl || customLogoUrl || partner.logoUrl;

  return (
    <div className="min-h-screen bg-[#f7faf6] text-[#233127]">
      <PublicHeader />

      {!showFullWidthBanner && (
        <section className="overflow-hidden border-b border-[#dfe7dd] bg-gradient-to-br from-[#163a27] via-[#22563b] to-[#2e6f4a] py-14 text-white md:py-20">
          <div className="container max-w-6xl px-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#cce8d6]">Parceiro em destaque</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight md:text-5xl">{partner.name}</h1>
            <p className="mt-4 max-w-2xl text-lg text-white/85">
              {partner.description || "Parceiro da rede Parceiros do Bem, apoiando campanhas sociais com presença e divulgação."}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {partnerWebsiteUrl && (
                <a href={partnerWebsiteUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-4 font-semibold text-[#1e4c34] hover:bg-[#eef8f0]">
                  <ExternalLink className="h-4 w-4" /> Site oficial
                </a>
              )}
              {whatsappUrl && (
                <a href={whatsappUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/55 px-4 font-semibold text-white hover:bg-white/10">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              )}
              {instagramUrl && (
                <a href={instagramUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/55 px-4 font-semibold text-white hover:bg-white/10">
                  <Instagram className="h-4 w-4" /> Instagram
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {showFullWidthBanner && (
        <section className="w-full overflow-hidden border-b border-[#dfe7dd] bg-[#0f2b1d]">
          <img
            src={encodeURI(customBannerUrl ?? "")}
            alt={`Banner de ${partner.name}`}
            className="h-[280px] w-full object-cover object-center md:h-[440px]"
          />
          <div className="border-t border-[#dfe7dd] bg-[#f7faf6]">
            <div className="container w-full max-w-6xl px-4 py-4 md:py-6">
              <div className="flex flex-wrap gap-3">
                {partnerWebsiteUrl && (
                  <a href={partnerWebsiteUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#1e4c34] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#173b29]">
                    <ExternalLink className="h-4 w-4" /> Site oficial
                  </a>
                )}
                {whatsappUrl && (
                  <a href={whatsappUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#1e4c34]/20 bg-white px-4 text-sm font-semibold text-[#1e4c34] shadow-sm transition hover:bg-[#eef8f0]">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                )}
                {instagramUrl && (
                  <a href={instagramUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#1e4c34]/20 bg-white px-4 text-sm font-semibold text-[#1e4c34] shadow-sm transition hover:bg-[#eef8f0]">
                    <Instagram className="h-4 w-4" /> Instagram
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <main className="container max-w-6xl space-y-8 px-4 py-10 md:py-14">
        <Card className={`grid gap-6 border-[#dce6da] p-6 md:p-8 ${showFullWidthBanner ? "md:grid-cols-1" : "md:grid-cols-[1.1fr_1fr]"}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#4f6656]">Apresentação</p>
            <h2 className="mt-2 text-2xl font-bold text-[#223126]">Conheça este parceiro</h2>
            <p className="mt-4 leading-relaxed text-[#4a5e51]">
              {partner.testimonialText || partner.description || "Este parceiro apoia nossas campanhas e ajuda a ampliar a rede de solidariedade com divulgação e colaboração ativa."}
            </p>
            {partner.ownerName && (
              <p className="mt-4 text-sm text-[#3f5347]"><strong>Responsável:</strong> {partner.ownerName}</p>
            )}
            {partner.address && (
              <p className="mt-1 text-sm text-[#3f5347]"><strong>Endereço:</strong> {partner.address}</p>
            )}
            {partner.contactInfo && (
              <p className="mt-1 text-sm text-[#3f5347]"><strong>Contato:</strong> {partner.contactInfo}</p>
            )}
          </div>
          {showFullWidthBanner ? null : (
            <div className="rounded-xl bg-[#eef4ec] p-4">
              {featuredImage ? (
                <img
                  src={encodeURI(featuredImage)}
                  alt={customBannerUrl ? `Banner de ${partner.name}` : `Logomarca de ${partner.name}`}
                  className={`w-full rounded-lg ${customBannerUrl ? "h-40 object-cover" : "h-32 object-contain bg-white p-3"}`}
                />
              ) : (
                <div className="flex h-32 items-center justify-center rounded-lg bg-white text-[#66806f]"><Handshake className="h-8 w-8" /></div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="overflow-hidden rounded-lg bg-white">
                  {partner.storePhotoUrl ? (
                    <img src={partner.storePhotoUrl} alt={`Foto da loja de ${partner.name}`} className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 items-center justify-center text-xs text-[#6f8176]"><Store className="mr-1 h-4 w-4" /> Loja</div>
                  )}
                </div>
                <div className="overflow-hidden rounded-lg bg-white">
                  {partner.ownerPhotoUrl ? (
                    <img src={partner.ownerPhotoUrl} alt={`Foto do responsável de ${partner.name}`} className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 items-center justify-center text-xs text-[#6f8176]">Responsável</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card className="border-[#dce6da] p-6 md:p-8">
          <h3 className="text-xl font-bold text-[#223126]">Apoie quem apoia causas sociais</h3>
          <p className="mt-2 text-[#4a5e51]">
            Ao conhecer e divulgar este parceiro, você fortalece o ecossistema que sustenta nossas campanhas. Cada parceria ativa ajuda a gerar mais impacto social.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild className="bg-[#228B22] hover:bg-[#1c731c]"><Link href="/campaigns">Ver campanhas</Link></Button>
            <Button asChild variant="outline" className="border-[#228B22]/40 text-[#228B22]"><Link href="/">Voltar ao início</Link></Button>
          </div>
        </Card>

        {videoSource && (
          <Card className="border-[#dce6da] p-6 md:p-8">
            <h3 className="text-xl font-bold text-[#223126]">Vídeo de apresentação do parceiro</h3>
            <p className="mt-2 text-[#4a5e51]">
              Espaço dedicado para destacar ações, promoções e campanhas do parceiro em potencial.
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-[#dce6da] bg-[#f1f6ef]">
              <div className="aspect-video w-full">
                {videoSource.kind === "embed" ? (
                  <iframe
                    className="h-full w-full"
                    src={videoSource.src}
                    title={`Video de apresentacao de ${partner.name}`}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                ) : (
                  <video className="h-full w-full" controls preload="metadata">
                    <source src={encodeURI(videoSource.src)} type={videoSource.mimeType} />
                    Seu navegador não suporta reprodução de vídeo.
                  </video>
                )}
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

function PartnerState({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-h-screen bg-[#f7faf6]">
      <PublicHeader />
      <main className="container max-w-3xl px-4 py-20 text-center">
        <h1 className="text-3xl font-bold text-[#223126]">{title}</h1>
        <p className="mt-3 text-[#5a6d61]">{description}</p>
        <div className="mt-6"><Link href="/">Voltar para o início</Link></div>
      </main>
    </div>
  );
}
