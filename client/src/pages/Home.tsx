import CampaignCard from "@/components/CampaignCard";
import PublicHeader from "@/components/PublicHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Building2, ExternalLink, Handshake, Heart, ShieldCheck, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

const formatCurrency = (value: number) =>
  (value / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

type PublishedCampaign = {
  id: number;
  title: string;
  description: string;
  longDescription?: string | null;
  category?: string | null;
  goal: number;
  imageUrl: string | null;
  createdBy: number;
  status: "active" | "completed" | "paused" | "archived";
  createdAt: Date;
  updatedAt: Date;
  raised: number;
  remaining: number;
  progress: number;
  contributorsCount: number;
  galleryImages: string[];
  needs: unknown[];
  updates: unknown[];
  documents: unknown[];
};

export default function Home() {
  const featuredInput = useMemo(() => ({ status: "active" as const, limit: 3 }), []);
  const completedInput = useMemo(() => ({ status: "completed" as const, limit: 3 }), []);
  const campaignsQuery = trpc.campaigns.listPublished.useQuery(featuredInput);
  const completedQuery = trpc.campaigns.listPublished.useQuery(completedInput);
  const statsQuery = trpc.campaigns.getPublicStats.useQuery();
  const partnersQuery = trpc.partners.listPublished.useQuery();
  const campaigns = (campaignsQuery.data ?? []) as PublishedCampaign[];
  const completedCampaigns = (completedQuery.data ?? []) as PublishedCampaign[];
  const partners = (partnersQuery.data ?? []) as PartnerItem[];
  const validPartners = partners.filter((partner) => {
    const name = partner.name.trim().toLowerCase();
    return name.length > 1 && !name.includes("localhost") && !name.includes("127.0.0.1");
  });
  const visiblePartners = validPartners.length > 0 ? validPartners : getDemoPartners();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-white pb-22 md:pb-24">
      <PublicHeader />

      <section
        className="relative overflow-hidden flex h-[430px] items-center justify-center text-white md:h-[470px]"
        style={{
          backgroundImage: "linear-gradient(135deg, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.32)), url('https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=1600&q=80')",
          backgroundSize: "cover",
          backgroundPosition: "top center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="container relative flex h-full w-full max-w-7xl items-center justify-center px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-5 text-base font-semibold uppercase tracking-[0.22em] text-white/85 sm:text-lg">
              Solidariedade com transparência
            </p>
            <h1 className="mb-6 text-5xl font-bold uppercase leading-[1.05] md:text-6xl tracking-[0.06em]">
              Juntos Transformamos Vidas
            </h1>
            <p className="mx-auto mb-9 max-w-2xl text-lg leading-relaxed text-white/90 md:text-xl">
              Cada contribuição se transforma em cuidado, dignidade e esperança para quem mais precisa.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/campaigns"
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-white px-7 font-semibold text-[#18751f] transition hover:bg-[#f2f7f1] active:scale-[0.97]"
              >
                Eu quero ajudar
              </Link>
              <a
                href="#parceiros"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/70 px-7 font-semibold text-white transition hover:bg-white/10 active:scale-[0.97]"
              >
                Quero ser parceiro
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#1f1f1f] bg-[#111111] py-4" aria-label="Navegação principal">
        <div className="container flex flex-wrap justify-center gap-4 px-4 text-sm font-semibold uppercase tracking-[0.18em] text-white sm:gap-8">
          <Link href="/campaigns" className="transition hover:text-[#7adf8b]">
            Campanhas
          </Link>
          <Link href="/donors" className="transition hover:text-[#7adf8b]">
            Doadores
          </Link>
          <Link href="/accountability" className="transition hover:text-[#7adf8b]">
            Prestação de contas
          </Link>
          <Link href="/ambassadors" className="transition hover:text-[#7adf8b]">
            Embaixadores
          </Link>
        </div>
      </section>

      <section className="border-b border-[#e8ece8] bg-[#f7faf6] py-12 md:py-14" aria-labelledby="video-apresentacao-title">
        <div className="container max-w-7xl px-4">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#228B22]">Apresentação</p>
            <h2 id="video-apresentacao-title" className="text-3xl font-bold text-[#243128] md:text-4xl">
              Veja o propósito e o objetivo deste projeto
            </h2>
            <p className="mt-3 text-[#56645c] md:text-lg">
              Conheça algumas de nossas ações e seja um doador, seja um parceiro do bem.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-2xl border border-[#d7e2d7] bg-[#eaf1e8] shadow-sm">
            <div className="aspect-video w-full">
              <iframe
                className="h-full w-full"
                src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                title="Vídeo de apresentação da plataforma"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-4 md:py-6" id="campanhas">
        <div className="container max-w-7xl px-4">
          <div className="mb-4 flex flex-col items-start text-left md:items-center md:text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#228B22]">Campanhas e obras</p>
            <h2 className="text-4xl font-bold text-[#2d2d2d] md:text-5xl">Apoie campanhas que transformam vidas, do planejamento à realização</h2>
            <Link href="/campaigns" className="mt-4 font-semibold text-[#228B22] hover:underline">
              Ver todas as campanhas
            </Link>
          </div>

          {campaignsQuery.isLoading && (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-[460px] rounded-xl" />)}
            </div>
          )}

          {campaignsQuery.isError && (
            <Card className="p-8 text-center">
              <h3 className="text-xl font-semibold text-[#2d2d2d]">Não foi possível carregar as campanhas</h3>
              <p className="mt-2 text-[#6d6d6d]">Tente novamente em alguns instantes.</p>
            </Card>
          )}

          {!campaignsQuery.isLoading && !campaignsQuery.isError && campaigns.length === 0 && (
            <Card className="border-dashed p-10 text-center">
              <Building2 className="mx-auto h-10 w-10 text-[#228B22]" aria-hidden="true" />
              <h3 className="mt-4 text-2xl font-semibold text-[#2d2d2d]">Projetos reais chegam em breve</h3>
              <p className="mx-auto mt-2 max-w-xl text-[#6d6d6d]">
                A equipe está preparando as primeiras obras, com necessidades concretas, evolução registrada e transparência em cada etapa.
              </p>
            </Card>
          )}

          {campaigns.length > 0 && (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}
            </div>
          )}
        </div>
      </section>

      <section className="border-b border-[#e5e5e5] bg-white py-5" aria-label="Indicadores da plataforma">
        <div className="container grid max-w-7xl grid-cols-1 gap-6 px-4 sm:grid-cols-2">
          {statsQuery.isLoading ? (
            Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="mx-auto h-12 w-36" />)
          ) : (
            <>
              <Stat value={String(statsQuery.data?.activeCampaigns ?? 0)} label="Campanhas ativas" />
              <Stat value={String(statsQuery.data?.contributorsCount ?? 0)} label="Contribuidores confirmados" />
            </>
          )}
        </div>
      </section>

      <section className="bg-[#f3f6f2] py-20 md:py-28" id="sobre">
        <div className="container max-w-7xl px-4">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#228B22]">Como funciona</p>
            <h2 className="text-4xl font-bold text-[#2d2d2d]">Uma jornada simples, transparente e com impacto real</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: Heart, title: "Escolha uma campanha", description: "Conheça a etapa atual, as necessidades e as atualizações antes de contribuir para a obra." },
              { icon: Zap, title: "Contribua do seu jeito", description: "Doe financeiramente, ofereça materiais ou disponibilize sua mão de obra para a evolução da obra." },
              { icon: ShieldCheck, title: "Acompanhe o progresso", description: "Consulte fotos, registros e documentos publicados em cada etapa da campanha." },
            ].map((item) => (
              <Card key={item.title} className="border-0 bg-white p-8 shadow-sm">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#228B22]/10">
                  <item.icon className="h-7 w-7 text-[#228B22]" aria-hidden="true" />
                </div>
                <h3 className="mb-3 text-xl font-bold text-[#2d2d2d]">{item.title}</h3>
                <p className="leading-relaxed text-[#6d6d6d]">{item.description}</p>
              </Card>
            ))}
          </div>
          <div className="mt-12 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/campaigns"
              className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#228B22] px-7 font-semibold text-white transition hover:bg-[#1b711b] active:scale-[0.97]"
            >
              <Heart className="mr-2 h-5 w-5" aria-hidden="true" /> Eu quero ajudar
            </Link>
            <a
              href="#parceiros"
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#228B22] px-7 font-semibold text-[#228B22] hover:bg-[#228B22]/5 active:scale-[0.97]"
            >
              <Handshake className="mr-2 h-5 w-5" aria-hidden="true" /> Quero ser parceiro
            </a>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28" aria-labelledby="historias-title">
        <div className="container max-w-7xl px-4">
          <div className="mb-10 max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#228B22]">Histórias de sucesso</p>
            <h2 id="historias-title" className="text-4xl font-bold text-[#2d2d2d]">Resultados publicados com evidências</h2>
          </div>
          {completedQuery.isLoading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : completedCampaigns.length > 0 ? (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {completedCampaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}
            </div>
          ) : (
            <Card className="border-dashed p-10 text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-[#228B22]" aria-hidden="true" />
              <h3 className="mt-4 text-2xl font-semibold text-[#2d2d2d]">Nenhuma história concluída publicada ainda</h3>
              <p className="mx-auto mt-2 max-w-2xl text-[#6d6d6d]">
                Os registros de antes e depois aparecerão aqui somente após a conclusão e validação das campanhas.
              </p>
            </Card>
          )}
          <div className="mt-12 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/campaigns"
              className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#228B22] px-7 font-semibold text-white transition hover:bg-[#1b711b] active:scale-[0.97]"
            >
              <Heart className="mr-2 h-5 w-5" aria-hidden="true" /> Eu quero ajudar
            </Link>
            <a
              href="#parceiros"
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#228B22] px-7 font-semibold text-[#228B22] hover:bg-[#228B22]/5 active:scale-[0.97]"
            >
              <Handshake className="mr-2 h-5 w-5" aria-hidden="true" /> Quero ser parceiro
            </a>
          </div>
        </div>
      </section>

      <section id="parceiros" className="bg-[#1f2c29] py-20 text-white md:py-28" aria-labelledby="parceiros-title">
        <div className="container max-w-7xl px-4">
          <div className="mb-12 grid gap-6 md:grid-cols-[1fr_0.55fr] md:items-end">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#c6d6c3]">Rede de parceiros</p>
              <h2 id="parceiros-title" className="max-w-3xl text-4xl font-bold md:text-5xl">
                Empresas e profissionais que constroem impacto conosco
              </h2>
            </div>
            <p className="leading-relaxed text-white/75 md:text-right">
              Reconhecemos publicamente somente parceiros cadastrados e validados pela equipe responsável.
            </p>
          </div>

          {partnersQuery.isLoading && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-52 rounded-2xl bg-white/10" />
              ))}
            </div>
          )}

          {partnersQuery.isError && (
            <Card className="border-white/15 bg-white/10 p-8 text-center text-white">
              <h3 className="text-xl font-semibold">Não foi possível carregar os parceiros</h3>
              <p className="mt-2 text-white/70">Mostrando uma prévia da rede de parceiros enquanto a conexão estabiliza.</p>
            </Card>
          )}

          {!partnersQuery.isLoading && visiblePartners.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visiblePartners.map((partner) => <PartnerCard key={partner.id} partner={partner} />)}
            </div>
          )}

          <div className="mt-10 flex flex-col items-start justify-between gap-5 border-t border-white/15 pt-8 sm:flex-row sm:items-center">
            <p className="max-w-2xl text-white/75">
              Quer mobilizar pessoas para uma campanha? Conheça também o programa de embaixadores.
            </p>
            <Link
              href="/ambassadors"
              className="inline-flex min-h-12 items-center justify-center rounded-md bg-white px-7 font-semibold text-[#173f20] transition hover:bg-[#eef7ec] active:scale-[0.97]"
            >
              Conhecer embaixadores
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-white/15 bg-[#1f2c29] py-12 md:py-16">
        <div className="container max-w-7xl px-4">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-white">Pronto para fazer a diferença?</h2>
            <p className="mt-3 text-white/75">Escolha como você quer contribuir e seja parte dessa transformação</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/campaigns"
              className="inline-flex min-h-12 items-center justify-center rounded-md bg-white px-7 font-semibold text-[#1f2c29] transition hover:bg-[#f0f5f0] active:scale-[0.97]"
            >
              <Heart className="mr-2 h-5 w-5" aria-hidden="true" /> Eu quero ajudar
            </Link>
            <a
              href="#parceiros"
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-white px-7 font-semibold text-white transition hover:bg-white/10 active:scale-[0.97]"
            >
              <Handshake className="mr-2 h-5 w-5" aria-hidden="true" /> Quero ser parceiro
            </a>
          </div>
        </div>
      </section>

      <section className="border-t border-[#e8ece8] bg-[#f8fbf7] py-8" aria-labelledby="parceiros-destaque-title">
        <div className="container max-w-7xl px-4">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#228B22]">Parceiros em destaque</p>
              <h2 id="parceiros-destaque-title" className="mt-1 text-2xl font-bold text-[#243128]">Rede ativa de apoio</h2>
            </div>
            <a href="#parceiros" className="text-sm font-semibold text-[#228B22] hover:underline">Ver seção completa</a>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {visiblePartners.slice(0, 3).map((partner) => <PartnerCard key={`preview-${partner.id}`} partner={partner} />)}
          </div>
        </div>
      </section>

      <footer className="bg-[#18201d] py-10 text-white">
        <div className="container flex max-w-7xl flex-col justify-between gap-6 px-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Heart className="h-6 w-6 fill-[#55a94a] text-[#55a94a]" aria-hidden="true" />
            <span className="font-bold">Parceiros do Bem</span>
          </div>
          <div className="flex gap-5 text-sm text-white/70">
            <Link href="/campaigns" className="hover:text-white">Campanhas</Link>
            <Link href="/ambassadors" className="hover:text-white">Embaixadores</Link>
          </div>
          <p className="text-sm text-white/60">© 2026 Parceiros do Bem</p>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold text-[#228B22] md:text-4xl">{value}</div>
      <p className="mt-2 text-sm font-medium text-[#6d6d6d]">{label}</p>
    </div>
  );
}

type PartnerItem = {
  id: number;
  name: string;
  type: "company" | "individual";
  ownerName: string | null;
  description: string | null;
  logoUrl: string | null;
  storePhotoUrl: string | null;
  ownerPhotoUrl: string | null;
  address: string | null;
  contactInfo: string | null;
  testimonialVideoUrl: string | null;
  testimonialText: string | null;
  website: string | null;
};

function getDemoPartners(): PartnerItem[] {
  return [
    {
      id: -1,
      name: "Predimais",
      type: "company",
      ownerName: "Saulo Goulart",
      description: "Parceria de impacto social com mobilizacao comunitaria e apoio continuo as campanhas.",
      logoUrl: "https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=900&q=80",
      storePhotoUrl: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=900&q=80",
      ownerPhotoUrl: "https://images.unsplash.com/photo-1542204625-de293a2f0f9b?auto=format&fit=crop&w=900&q=80",
      address: "Rua Central, 120 - Centro",
      contactInfo: "(11) 99999-0101",
      testimonialVideoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      testimonialText: "A parceria abriu novas portas para apoiar quem realmente precisa.",
      website: "https://www.parceriadobem.com.br",
    },
    {
      id: -2,
      name: "Voz da Esperanca",
      type: "individual",
      ownerName: "Luciana Alves",
      description: "Locutora parceira que fortalece campanhas com comunicacao de alcance local.",
      logoUrl: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=900&q=80",
      storePhotoUrl: null,
      ownerPhotoUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=900&q=80",
      address: "Sao Paulo - SP",
      contactInfo: "@vozesperanca",
      testimonialVideoUrl: null,
      testimonialText: "Quando contamos historias reais, mais pessoas decidem contribuir.",
      website: "https://www.instagram.com",
    },
    {
      id: -3,
      name: "Arte em Movimento",
      type: "individual",
      ownerName: "Rafael Nunes",
      description: "Artista parceiro que mobiliza publico para campanhas de solidariedade.",
      logoUrl: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80",
      storePhotoUrl: null,
      ownerPhotoUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
      address: "Rio de Janeiro - RJ",
      contactInfo: "(21) 98888-0202",
      testimonialVideoUrl: null,
      testimonialText: "A arte aproxima pessoas e transforma causa em acao concreta.",
      website: "https://www.youtube.com",
    },
  ];
}

function PartnerCard({ partner }: { partner: PartnerItem }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [storePhotoFailed, setStorePhotoFailed] = useState(false);
  const [ownerPhotoFailed, setOwnerPhotoFailed] = useState(false);

  return (
    <Card className="group border-white/10 bg-white p-6 text-[#26332a] shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-1 hover:shadow-xl">
      <div className="mb-6 flex h-20 items-center justify-center rounded-xl bg-[#f4f7f2] p-3">
        {partner.logoUrl && !logoFailed ? (
          <img
            src={partner.logoUrl}
            alt={`Logomarca de ${partner.name}`}
            className="h-full max-w-full object-contain"
            loading="lazy"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-[#5a7d5f]">
            <Handshake className="h-7 w-7" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">Logo não informado</span>
          </span>
        )}
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a7d5f]">
        {partner.type === "company" ? "Empresa parceira" : "Profissional parceiro"}
      </p>
      <h3 className="mt-2 text-xl font-bold text-[#1f3023]">{partner.name}</h3>
      {partner.ownerName && <p className="mt-3 text-sm font-medium text-[#4f6255]">Responsável: {partner.ownerName}</p>}
      {partner.description && <p className="mt-2 line-clamp-3 leading-relaxed text-[#66736a]">{partner.description}</p>}
      {(partner.storePhotoUrl || partner.ownerPhotoUrl) && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="overflow-hidden rounded-lg bg-[#f4f7f2]">
            {partner.storePhotoUrl && !storePhotoFailed ? (
              <img
                src={partner.storePhotoUrl}
                alt={`Foto da loja de ${partner.name}`}
                className="h-24 w-full object-cover"
                loading="lazy"
                onError={() => setStorePhotoFailed(true)}
              />
            ) : (
              <div className="flex h-24 items-center justify-center text-center text-xs font-medium text-[#6a7b6f]">Foto da loja indisponível</div>
            )}
          </div>
          <div className="overflow-hidden rounded-lg bg-[#f4f7f2]">
            {partner.ownerPhotoUrl && !ownerPhotoFailed ? (
              <img
                src={partner.ownerPhotoUrl}
                alt={`Foto do responsável de ${partner.name}`}
                className="h-24 w-full object-cover"
                loading="lazy"
                onError={() => setOwnerPhotoFailed(true)}
              />
            ) : (
              <div className="flex h-24 items-center justify-center text-center text-xs font-medium text-[#6a7b6f]">Foto do responsável indisponível</div>
            )}
          </div>
        </div>
      )}
      {(partner.testimonialVideoUrl || partner.testimonialText) && (
        <div className="mt-4 rounded-xl border border-[#d7e6d9] bg-[#f5faf5] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#2f6f49]">Testemunho</p>
          {partner.testimonialText && (
            <p className="mt-2 text-sm italic leading-relaxed text-[#4f6658]">"{partner.testimonialText}"</p>
          )}
          {partner.testimonialVideoUrl && (
            <a
              href={partner.testimonialVideoUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#228B22] hover:underline"
            >
              Assistir depoimento <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </div>
      )}
      {partner.address && <p className="mt-4 text-sm text-[#5f7364]">Endereço: {partner.address}</p>}
      {partner.contactInfo && <p className="mt-1 text-sm text-[#5f7364]">Contato: {partner.contactInfo}</p>}
      {partner.website && (
        <a
          href={partner.website}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-5 inline-flex items-center gap-2 font-semibold text-[#228B22] hover:underline"
        >
          Visitar site <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
      <div className="mt-4">
        <Link href={`/partner/${partner.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f3023] hover:text-[#228B22]">
          Ver página do parceiro <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
