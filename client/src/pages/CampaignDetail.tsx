import AnimatedProgressBar from "@/components/AnimatedProgressBar";
import CampaignComments from "@/components/CampaignComments";
import PublicHeader from "@/components/PublicHeader";
import SocialShare from "@/components/SocialShare";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CalendarDays, ChevronLeft, Download, Heart, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { Link, useRoute } from "wouter";

const formatCurrency = (value: number) =>
  (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (value: Date | string | null) => {
  if (!value) return "Data não informada";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
};

export default function CampaignDetail() {
  const [, params] = useRoute("/campaign/:id");
  const campaignId = Number(params?.id ?? 0);
  const campaignQuery = trpc.campaigns.getById.useQuery(
    { id: campaignId },
    { enabled: Number.isInteger(campaignId) && campaignId > 0 },
  );

  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return <CampaignState title="Campanha inválida" description="O endereço informado não corresponde a uma campanha." />;
  }

  if (campaignQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#f8faf7]">
        <PublicHeader />
        <Skeleton className="h-[420px] w-full rounded-none" />
        <div className="container max-w-7xl px-4 py-12">
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (campaignQuery.isError) {
    return <CampaignState title="Não foi possível carregar a campanha" description="Tente novamente em alguns instantes." />;
  }

  const campaign = campaignQuery.data;
  if (!campaign) {
    return <CampaignState title="Campanha não encontrada" description="Ela pode não estar publicada ou ter sido arquivada." />;
  }

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <div className="border-b border-[#e2e7e0] bg-white">
        <div className="container max-w-7xl px-4 py-4">
          <Link href="/campaigns" className="inline-flex items-center gap-2 text-sm font-semibold text-[#4f6550] hover:text-[#228B22]">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar às campanhas
          </Link>
        </div>
      </div>

      <section className="relative min-h-[240px] overflow-hidden bg-[#dcebd9] md:min-h-[280px]">
        {campaign.galleryImages[0] ? (
          <img src={campaign.galleryImages[0]} alt={`Imagem principal de ${campaign.title}`} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Heart className="h-24 w-24 text-[#228B22]/35" aria-hidden="true" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="container relative flex min-h-[240px] max-w-7xl flex-col items-center justify-start px-4 pt-6 text-center md:min-h-[280px] md:pt-8">
          <div className="mx-auto max-w-4xl text-white">
            <span className="mb-2 inline-flex rounded-full bg-[#228B22] px-4 py-1 text-sm font-semibold">
              {campaign.status === "completed" ? "Campanha concluída" : "Campanha ativa"}
            </span>
            <h1 className="text-4xl font-bold uppercase leading-tight md:text-5xl tracking-[0.06em]">{campaign.title}</h1>
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs md:text-sm text-white/85">
              <span className="flex items-center gap-2"><Users className="h-3 w-3 md:h-4 md:w-4" /> {campaign.contributorsCount} contribuidores</span>
              <span className="flex items-center gap-2"><CalendarDays className="h-3 w-3 md:h-4 md:w-4" /> {formatDate(campaign.createdAt)}</span>
            </div>
          </div>
        </div>
      </section>

      <main className="container max-w-7xl px-4 py-8 md:py-12">
        <div className="space-y-8">
          {/* PROGRESSO CONFIRMADO - Em Cima */}
          <Card className="p-6 lg:p-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4f6550]">Progresso confirmado</h2>
            <div className="mt-5">
              <AnimatedProgressBar current={campaign.raised} goal={campaign.goal} animated showLabel />
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-4">
              <div><dt className="text-sm text-[#787878]">Arrecadado</dt><dd className="text-2xl font-bold text-[#228B22]">{formatCurrency(campaign.raised)}</dd></div>
              <div><dt className="text-sm text-[#787878]">Meta</dt><dd className="text-lg font-semibold text-[#2d2d2d]">{formatCurrency(campaign.goal)}</dd></div>
              <div><dt className="text-sm text-[#787878]">Falta</dt><dd className="text-lg font-semibold text-[#2d2d2d]">{formatCurrency(campaign.remaining)}</dd></div>
              <div><dt className="text-sm text-[#787878]">Contribuidores</dt><dd className="text-lg font-semibold text-[#228B22]">{campaign.contributorsCount}</dd></div>
            </dl>
          </Card>

          {/* BOTÕES DE AÇÃO - Em Cima */}
          <div className="grid gap-3 sm:grid-cols-2">
            {campaign.status === "active" ? (
              <Link href={`/contribute/wizard/${campaign.id}`} className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#228B22] px-5 font-semibold text-white transition hover:bg-[#1b711b] active:scale-[0.97]">
                <Heart className="mr-2 h-5 w-5" aria-hidden="true" /> Eu quero ajudar
              </Link>
            ) : (
              <div className="rounded-lg bg-[#228B22]/10 p-4 text-center font-semibold text-[#228B22]">Campanha concluída</div>
            )}
            <a href="#parceiros" className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#228B22] px-5 font-semibold text-[#228B22] hover:bg-[#228B22]/5">
              Quero ser parceiro
            </a>
          </div>

          {/* COMPARTILHAMENTO SOCIAL */}
          <Card className="p-6">
            <SocialShare
              title={campaign.title}
              description={campaign.description}
              url={`${typeof window !== "undefined" ? window.location.origin : ""}/campaign/${campaign.id}`}
              campaignId={campaign.id}
            />
          </Card>

          {/* SOBRE O PROJETO */}
          <div>
            <Card className="mb-8 p-7 md:p-9">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">Sobre o projeto</p>
              <h2 className="mb-5 text-3xl font-bold text-[#2d2d2d]">{campaign.description}</h2>
              <p className="whitespace-pre-line leading-relaxed text-[#656565]">
                {campaign.longDescription || "A obra já começou e a equipe está organizando as etapas iniciais para transformar a ideia em realidade. Acompanhe a evolução, as necessidades e as contribuições que já estão ajudando o projeto a avançar."}
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#dfe8de] bg-[#f7fbf6] p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">Evolução do projeto</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#5b655c]">
                    Atualizações de obra, fotos de cada etapa e informações claras sobre o que já foi realizado.
                  </p>
                </div>
                <div className="rounded-2xl border border-[#dfe8de] bg-[#f7fbf6] p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">Fotos reais</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#5b655c]">
                    Esta campanha está pronta para receber imagens reais da construção e mostrar o avanço da obra fase a fase.
                  </p>
                </div>
              </div>
            </Card>

            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4f6550]">Atualizações</p>
                <p className="mt-3 text-3xl font-bold text-[#228B22]">{campaign.updates.length}</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4f6550]">Fotos</p>
                <p className="mt-3 text-3xl font-bold text-[#228B22]">{campaign.galleryImages.length}</p>
              </Card>
            </div>

            <Tabs defaultValue="gallery">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-[#edf2ec] p-1 sm:grid-cols-4">
                <TabsTrigger value="gallery">Galeria</TabsTrigger>
                <TabsTrigger value="timeline">Atualizações</TabsTrigger>
                <TabsTrigger value="needs">Necessidades</TabsTrigger>
                <TabsTrigger value="comments">Mural</TabsTrigger>
              </TabsList>

              <TabsContent value="gallery" className="mt-6">
                {campaign.galleryImages.length > 0 ? (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-3xl bg-[#f7fbf6] shadow-sm">
                      <img src={campaign.galleryImages[0]} alt={`Foto principal da obra ${campaign.title}`} className="h-[420px] w-full object-cover" />
                    </div>
                    {campaign.galleryImages.length > 1 ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {campaign.galleryImages.slice(1).map((image) => (
                          <img key={image} src={image} alt={`Foto da obra ${campaign.title}`} className="h-64 w-full rounded-xl object-cover" />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <EmptySection title="Galeria da obra em andamento" description="As fotos reais da evolução da construção aparecerão aqui conforme a obra avançar." />
                )}
              </TabsContent>

              <TabsContent value="timeline" className="mt-6 space-y-4">
                {campaign.updates.length > 0 ? campaign.updates.map((update) => (
                  <Card key={update.id} className="p-6">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="rounded-full bg-[#228B22]/10 px-3 py-1 font-semibold text-[#228B22]">
                        {update.phase === "before" ? "Antes" : update.phase === "during" ? "Durante" : "Depois"}
                      </span>
                      <span className="text-[#787878]">{formatDate(update.createdAt)}</span>
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-[#2d2d2d]">{update.title}</h3>
                    <p className="mt-2 leading-relaxed text-[#656565]">{update.description}</p>
                    {update.images.length > 0 && (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {update.images.map((image) => (
                          <img key={image} src={image} alt={`Atualização: ${update.title}`} className="h-48 w-full rounded-lg object-cover" />
                        ))}
                      </div>
                    )}
                  </Card>
                )) : <EmptySection title="Ainda não há atualizações publicadas" description="A linha do tempo ficará pronta para mostrar cada etapa da obra, desde a preparação até a conclusão." />}
              </TabsContent>

              <TabsContent value="needs" className="mt-6 space-y-4">
                {campaign.needs.length > 0 ? campaign.needs.map((need) => (
                  <Card key={need.id} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-[#2d2d2d]">{need.name}</h3>
                        <p className="mt-1 text-sm text-[#656565]">{need.quantity || "Quantidade a confirmar"}</p>
                        {need.description && <p className="mt-2 text-sm text-[#787878]">{need.description}</p>}
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        need.priority === "high" ? "bg-red-100 text-red-700" : need.priority === "medium" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700"
                      }`}>
                        Prioridade {need.priority === "high" ? "alta" : need.priority === "medium" ? "média" : "baixa"}
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#dcdcdc]">
                      <div className="h-full bg-[#228B22]" style={{ width: `${Math.min(100, Math.max(0, need.fulfilled ?? 0))}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-[#787878]">{need.fulfilled ?? 0}% atendido</p>
                  </Card>
                )) : <EmptySection title="Necessidades em definição" description="A equipe está organizando os materiais e os serviços que serão prioritários na obra." />}
              </TabsContent>

              <TabsContent value="comments" className="mt-6">
                <CampaignComments campaignId={campaign.id} />
              </TabsContent>
            </Tabs>
          </div>

          {/* PROGRESSO CONFIRMADO - Em Baixo */}
          <Card className="p-6 lg:p-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4f6550]">Progresso confirmado</h2>
            <div className="mt-5">
              <AnimatedProgressBar current={campaign.raised} goal={campaign.goal} animated showLabel />
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-4">
              <div><dt className="text-sm text-[#787878]">Arrecadado</dt><dd className="text-2xl font-bold text-[#228B22]">{formatCurrency(campaign.raised)}</dd></div>
              <div><dt className="text-sm text-[#787878]">Meta</dt><dd className="text-lg font-semibold text-[#2d2d2d]">{formatCurrency(campaign.goal)}</dd></div>
              <div><dt className="text-sm text-[#787878]">Falta</dt><dd className="text-lg font-semibold text-[#2d2d2d]">{formatCurrency(campaign.remaining)}</dd></div>
              <div><dt className="text-sm text-[#787878]">Contribuidores</dt><dd className="text-lg font-semibold text-[#228B22]">{campaign.contributorsCount}</dd></div>
            </dl>
          </Card>

          {/* BOTÕES DE AÇÃO */}
          <div className="grid gap-3 sm:grid-cols-2">
            {campaign.status === "active" ? (
              <Link href={`/contribute/wizard/${campaign.id}`} className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#228B22] px-5 font-semibold text-white transition hover:bg-[#1b711b] active:scale-[0.97]">
              <Heart className="mr-2 h-5 w-5" aria-hidden="true" /> Eu quero ajudar
              </Link>
            ) : (
              <div className="rounded-lg bg-[#228B22]/10 p-4 text-center font-semibold text-[#228B22]">Campanha concluída</div>
            )}
            <a href="#parceiros" className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#228B22] px-5 font-semibold text-[#228B22] hover:bg-[#228B22]/5">
              Quero ser parceiro
            </a>
          </div>
        </div>
      </main>

      <section id="transparencia" className="border-t border-[#e0e6de] bg-white py-14 md:py-20">
        <div className="container max-w-7xl px-4">
          <div className="mb-9 flex items-start gap-4">
            <div className="rounded-xl bg-[#228B22]/10 p-3"><ShieldCheck className="h-7 w-7 text-[#228B22]" aria-hidden="true" /></div>
            <div>
              <h2 className="text-3xl font-bold text-[#2d2d2d]">Documentos de transparência</h2>
              <p className="mt-2 text-[#656565]">Somente documentos publicados para esta campanha aparecem abaixo.</p>
            </div>
          </div>
          {campaign.documents.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {campaign.documents.map((document) => (
                <Card key={document.id} className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <h3 className="font-semibold text-[#2d2d2d]">{document.title}</h3>
                    <p className="mt-1 text-sm text-[#787878]">
                      {document.amount ? formatCurrency(document.amount) : "Sem valor associado"} · {formatDate(document.uploadedAt)}
                    </p>
                  </div>
                  <a href={document.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-[#228B22] hover:underline">
                    <Download className="h-4 w-4" aria-hidden="true" /> Abrir
                  </a>
                </Card>
              ))}
            </div>
          ) : (
            <EmptySection title="Nenhum documento publicado" description="Os comprovantes aparecerão aqui após revisão da equipe responsável." />
          )}
        </div>
      </section>
    </div>
  );
}

function CampaignState({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <div className="container max-w-3xl px-4 py-24 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-[#a87508]" aria-hidden="true" />
        <h1 className="mt-5 text-3xl font-bold text-[#2d2d2d]">{title}</h1>
        <p className="mt-3 text-[#656565]">{description}</p>
        <Link href="/campaigns" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-md bg-[#228B22] px-6 font-semibold text-white">Ver campanhas</Link>
      </div>
    </div>
  );
}

function EmptySection({
  title,
  description,
  icon: Icon = AlertCircle,
}: {
  title: string;
  description: string;
  icon?: typeof AlertCircle;
}) {
  return (
    <Card className="border-dashed p-9 text-center">
      <Icon className="mx-auto h-9 w-9 text-[#228B22]" aria-hidden="true" />
      <h3 className="mt-4 text-xl font-semibold text-[#2d2d2d]">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-[#656565]">{description}</p>
    </Card>
  );
}
