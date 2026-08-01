import PublicHeader from "@/components/PublicHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Crown } from "lucide-react";
import { useState } from "react";
import { Link, useRoute } from "wouter";

const SPECIAL_APARTMENT_DONATION_CENTS = 120_000_00;
const DEFAULT_VIP_MEDIA_VIDEO_URL = "/89343f15-ccb1-4937-b353-a3cbb5f23bd6.mp4";
const DEFAULT_VIP_MEDIA_VIDEO_FALLBACK_URL = "/Parceiros/WhatsApp Video 2026-07-28 at 15.37.04.mp4";
const DEFAULT_VIP_MEDIA_IMAGES = ["/render-quarto.jpg", "/render-hotel.jpg", "/obra-lavanderia.jpg"];

const formatCurrency = (valueInCents: number) =>
  (valueInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const toEmbedVideoUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();

    if (host.includes("youtu.be")) {
      const id = url.pathname.replace("/", "").trim();
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.includes("youtube.com")) {
      const id = url.searchParams.get("v")?.trim();
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.includes("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }

    return null;
  } catch {
    return null;
  }
};

export default function ContributionVipPage() {
  const [, params] = useRoute("/contribute/vip/:id");
  const campaignId = Number(params?.id ?? 0);
  const [videoIndex, setVideoIndex] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);

  const campaignQuery = trpc.campaigns.getById.useQuery(
    { id: campaignId },
    { enabled: Number.isInteger(campaignId) && campaignId > 0 },
  );

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return (
      <div className="min-h-screen bg-[#f8faf7]">
        <PublicHeader />
        <div className="container max-w-6xl px-4 py-16">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold text-[#2d2d2d]">Campanha inválida</h1>
            <p className="mt-2 text-[#656565]">Não foi possível abrir os detalhes do apartamento VIP.</p>
          </Card>
        </div>
      </div>
    );
  }

  if (campaignQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#f8faf7]">
        <PublicHeader />
        <div className="container max-w-6xl px-4 py-16">
          <Skeleton className="h-12 w-80" />
          <Skeleton className="mt-6 h-[420px] w-full" />
        </div>
      </div>
    );
  }

  if (campaignQuery.isError || !campaignQuery.data) {
    return (
      <div className="min-h-screen bg-[#f8faf7]">
        <PublicHeader />
        <div className="container max-w-6xl px-4 py-16">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold text-[#2d2d2d]">Campanha não encontrada</h1>
            <p className="mt-2 text-[#656565]">A campanha pode não estar publicada no momento.</p>
          </Card>
        </div>
      </div>
    );
  }

  const campaign = campaignQuery.data;
  const vipApartmentAmountCents = ("vipApartmentAmountCents" in campaign && typeof campaign.vipApartmentAmountCents === "number")
    ? campaign.vipApartmentAmountCents
    : SPECIAL_APARTMENT_DONATION_CENTS;

  const configuredVipImages = Array.isArray((campaign as { vipMediaImages?: unknown }).vipMediaImages)
    ? ((campaign as { vipMediaImages?: unknown }).vipMediaImages as unknown[])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 6)
    : [];
  const configuredVipVideos = Array.isArray((campaign as { vipMediaVideos?: unknown }).vipMediaVideos)
    ? ((campaign as { vipMediaVideos?: unknown }).vipMediaVideos as unknown[])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 10)
    : [];

  const campaignGalleryImages = Array.isArray((campaign as { galleryImages?: unknown }).galleryImages)
    ? ((campaign as { galleryImages?: unknown }).galleryImages as unknown[])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 6)
    : [];
  const campaignUpdates = Array.isArray((campaign as { updates?: unknown }).updates)
    ? ((campaign as { updates?: unknown }).updates as Array<{ videos?: unknown }>).slice()
    : [];
  const campaignVideoUrls = campaignUpdates.flatMap((update) => {
    if (!Array.isArray(update.videos)) return [];
    return update.videos.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  });

  const vipGalleryImages = configuredVipImages.length > 0
    ? configuredVipImages
    : campaignGalleryImages.length > 0
      ? campaignGalleryImages
      : DEFAULT_VIP_MEDIA_IMAGES;
  const videoCandidates = Array.from(new Set([
    ...configuredVipVideos,
    ...campaignVideoUrls,
    DEFAULT_VIP_MEDIA_VIDEO_URL,
    DEFAULT_VIP_MEDIA_VIDEO_FALLBACK_URL,
  ].filter((url) => typeof url === "string" && url.trim().length > 0)));
  const vipVideoUrl = videoCandidates[videoIndex] ?? null;
  const vipVideoEmbedUrl = vipVideoUrl ? toEmbedVideoUrl(vipVideoUrl) : null;

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <main className="container max-w-6xl px-4 py-6 md:py-8">
        <Link href={`/contribute/help/${campaignId}`} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#4f6550] hover:text-[#228B22]">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar às opções de ajuda
        </Link>

        <div className="rounded-xl border-2 border-[#c5961a] bg-gradient-to-r from-[#fff5cf] via-[#f4d57e] to-[#e7bb49] p-6 md:p-8">
          <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-[#6a4600]">
            <Crown className="h-4 w-4" aria-hidden="true" /> Doador VIP
          </p>
          <h1 className="mt-2 text-center text-3xl font-black uppercase tracking-[0.02em] text-[#5b3a00] md:text-4xl">Apartamento completo</h1>
          <p className="mt-2 flex w-fit mx-auto rounded-md border border-[#d6b35b] bg-white/70 px-3 py-1 text-center text-xs font-extrabold uppercase tracking-[0.05em] text-[#6a4600] md:text-sm">
            Quero doar a construcao de um apartamento completo
          </p>
          <p className="mt-3 max-w-4xl text-center text-sm text-[#5b3a00] md:text-base">
            Aqui estão os detalhes do apartamento decorado que será construído com sua doação VIP.
            Você vê o vídeo e as fotos nesta página e depois segue para o pagamento.
          </p>

          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded-md border border-[#e3c98a] bg-white/70 p-3 text-[#5b3a00]">
              <p className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#8a5b00]">Valor sugerido</p>
              <p className="mt-1 text-xl font-black">{formatCurrency(vipApartmentAmountCents)}</p>
            </div>
            <div className="rounded-md border border-[#e3c98a] bg-white/70 p-3 text-[#5b3a00]">
              <p className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#8a5b00]">Configuração</p>
              <p className="mt-1 font-semibold">5 camas box de solteiro</p>
            </div>
            <div className="rounded-md border border-[#e3c98a] bg-white/70 p-3 text-[#5b3a00]">
              <p className="text-xs font-extrabold uppercase tracking-[0.06em] text-[#8a5b00]">Adaptação</p>
              <p className="mt-1 font-semibold">1 cama de casal para encontros</p>
            </div>
          </div>
        </div>

        <section className="mt-5 rounded-xl border border-[#d7c18a] bg-gradient-to-b from-[#fff9e7] via-[#fff4d6] to-[#ffeab5] p-4 md:p-6">
          <h2 className="text-xl font-black uppercase tracking-[0.03em] text-[#6a4600]">Vídeo e fotos do apartamento</h2>

          {vipVideoUrl && (
            <div className="mt-3 rounded-md border border-[#e3c98a] bg-white/80 p-3 text-sm text-[#5b3a00]">
              <p className="font-semibold">Vídeo de apresentação</p>
              <p className="mt-1">Tudo acontece nesta mesma página. Se não carregar, tentamos outra mídia sem sair daqui.</p>
              <button
                type="button"
                className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md bg-[#8a6708] px-4 text-xs font-extrabold uppercase tracking-[0.04em] text-white transition hover:bg-[#6d5006]"
                onClick={() => {
                  setVideoFailed(false);
                  setVideoIndex((current) => (current + 1 < videoCandidates.length ? current + 1 : 0));
                }}
              >
                Tentar outro vídeo aqui
              </button>
            </div>
          )}

          {vipVideoUrl && (
            <div className="mt-3 overflow-hidden rounded-lg border border-[#e3c98a] bg-black">
              {vipVideoEmbedUrl ? (
                <div className="aspect-video w-full">
                  <iframe
                    src={vipVideoEmbedUrl}
                    title={`Vídeo de apresentação do apartamento VIP da campanha ${campaign.title}`}
                    className="h-full w-full"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <video
                  key={vipVideoUrl}
                  className="aspect-video w-full"
                  controls
                  preload="metadata"
                  playsInline
                  poster={vipGalleryImages[0]}
                  onError={() => {
                    setVideoFailed(true);
                    setVideoIndex((current) => (current + 1 < videoCandidates.length ? current + 1 : current));
                  }}
                >
                  <source src={encodeURI(vipVideoUrl)} />
                </video>
              )}
            </div>
          )}

          {videoFailed && vipVideoUrl && (
            <p className="mt-2 text-xs font-semibold text-[#8a2e00]">
              O player teve falha neste dispositivo. Use o botão Abrir vídeo em nova aba.
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vipGalleryImages.map((imageUrl) => (
              <div key={imageUrl} className="overflow-hidden rounded-lg border border-[#e3c98a] bg-white">
                <img
                  src={imageUrl}
                  alt={`Foto do apartamento VIP da campanha ${campaign.title}`}
                  className="h-44 w-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 flex justify-end">
          <Link
            href={`/contribute/wizard/${campaignId}?type=financial&offer=apartment&amount=${vipApartmentAmountCents / 100}&go=payment`}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#8a6708] px-5 text-sm font-extrabold uppercase tracking-[0.04em] text-white transition hover:bg-[#6d5006]"
          >
            Quero doar a construcao de um apartamento completo
          </Link>
        </div>
      </main>
    </div>
  );
}