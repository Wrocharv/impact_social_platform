import PublicHeader from "@/components/PublicHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Heart, Lock, Users } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearch } from "wouter";
import { groupByCampaign, type PublicDonor } from "@/lib/publicDonors";

export default function DonorsPage() {
  const donorsQuery = trpc.contributions.getPublicDonors.useQuery();
  const donors = (donorsQuery.data ?? []) as PublicDonor[];

  // Vindo da pagina de uma campanha (/donors?campanha=12) o mural ja abre nela.
  const search = useSearch();
  const focusedCampaignId = useMemo(() => {
    const raw = new URLSearchParams(search).get("campanha");
    const parsed = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, [search]);

  const visibleDonors = useMemo(
    () => (focusedCampaignId ? donors.filter((donor) => donor.campaignId === focusedCampaignId) : donors),
    [donors, focusedCampaignId],
  );

  const groups = useMemo(() => groupByCampaign(visibleDonors), [visibleDonors]);
  const focusedTitle = focusedCampaignId ? groups[0]?.title ?? "esta campanha" : null;

  return (
    <>
      <PublicHeader />
      <main className="min-h-screen bg-gradient-to-b from-[#f8faf7] to-white">
        {/* Hero Section */}
        <section className="border-b border-[#e2e7e0] bg-white py-12 md:py-16">
          <div className="container max-w-7xl px-4">
            <div className="mb-8 flex items-start gap-4">
              <div className="rounded-xl bg-[#228B22]/10 p-3">
                <Heart className="h-7 w-7 text-[#228B22]" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-[#2d2d2d] md:text-5xl">
                  {focusedTitle ? "Doadores da campanha" : "Nossos Doadores"}
                </h1>
                {focusedTitle && (
                  <p className="mt-2 text-lg font-semibold text-[#228B22]">{focusedTitle}</p>
                )}
                <p className="mt-3 text-lg text-[#6d6d6d] max-w-2xl">
                  Conheça as pessoas que escolheram contribuir e construir um futuro melhor junto conosco.
                </p>
                <p className="mt-2 text-sm text-[#6d6d6d] max-w-2xl">
                  Aqui reconhecemos quem doou, nunca quanto doou. Os valores são
                  confidenciais: cada gesto vale pelo cuidado, não pelo tamanho.
                </p>
                {focusedCampaignId && (
                  <Link
                    href="/donors"
                    className="mt-3 inline-block text-sm font-semibold text-[#228B22] underline underline-offset-4"
                  >
                    Ver os doadores de todas as campanhas
                  </Link>
                )}
              </div>
            </div>

            {/* Stats */}
            {donorsQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4f6550]">Total de Doadores</p>
                  <p className="mt-3 text-3xl font-bold text-[#228B22]">{visibleDonors.length}</p>
                </Card>
                <Card className="p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4f6550]">
                    {focusedCampaignId ? "Campanha" : "Campanhas apoiadas"}
                  </p>
                  <p className="mt-3 text-3xl font-bold text-[#228B22]">
                    {focusedCampaignId ? "1" : groups.filter((group) => group.campaignId !== null).length}
                  </p>
                </Card>
              </div>
            )}
          </div>
        </section>

        {/* Convite pra area do doador: o unico lugar onde os valores aparecem,
            e so pra quem provar que a doacao e dela. */}
        <section className="border-b border-[#e2e7e0] bg-[#f6faf4]">
          <div className="container max-w-7xl px-4 py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[#228B22]" aria-hidden="true" />
                <p className="text-sm text-[#4e5c53]">
                  <span className="font-semibold text-[#2d2d2d]">Quer conferir o que você mesmo doou?</span>{" "}
                  Seu histórico com os valores fica numa área só sua. Confirmamos que é você por um código.
                </p>
              </div>
              <Link
                href="/minhas-doacoes"
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-[#228B22] px-5 font-semibold text-[#228B22] transition hover:bg-[#228B22] hover:text-white active:scale-[0.97]"
              >
                Ver minhas doações
              </Link>
            </div>
          </div>
        </section>

        {/* Doadores por campanha */}
        <section className="py-16 md:py-20">
          <div className="container max-w-7xl px-4">
            {donorsQuery.isLoading ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 rounded-xl" />
                ))}
              </div>
            ) : visibleDonors.length === 0 ? (
              <Card className="border-dashed p-10 text-center">
                <Users className="mx-auto h-10 w-10 text-[#228B22]" aria-hidden="true" />
                <h3 className="mt-4 text-2xl font-semibold text-[#2d2d2d]">Primeira doação em breve!</h3>
                <p className="mx-auto mt-2 max-w-2xl text-[#6d6d6d]">
                  Quando os primeiros doadores decidirem compartilhar seus nomes, eles aparecerão aqui como reconhecimento de sua generosidade.
                </p>
              </Card>
            ) : (
              <div className="space-y-14">
                {groups.map((group) => (
                  <div key={group.key}>
                    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b border-[#e2e7e0] pb-3">
                      <h2 className="text-2xl font-bold text-[#2d2d2d] md:text-3xl">{group.title}</h2>
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4f6550]">
                        {group.donors.length} {group.donors.length === 1 ? "doador" : "doadores"}
                      </p>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {group.donors.map((donor) => (
                        <Card
                          key={donor.id}
                          className="flex flex-col p-6 hover:shadow-lg transition duration-300 border-[#e7e7e7]"
                        >
                          <div className="flex items-start gap-3 mb-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#228B22]/10">
                              <Heart className="h-5 w-5 text-[#228B22]" aria-hidden="true" />
                            </div>
                            <div>
                              <h3 className="font-bold text-[#2d2d2d]">{donor.donorName}</h3>
                              <p className="text-xs text-[#787878]">{donor.donorCity}</p>
                            </div>
                          </div>

                          <div className="mt-auto pt-4 border-t border-[#e1e6df]">
                            <p className="text-sm text-[#656565]">
                              {/* Sem valor, de proposito: reconhecemos quem doou, nao quanto doou. */}
                              {donor.type === "financial" && (
                                <>
                                  Contribuiu <span className="font-semibold text-[#228B22]">financeiramente</span>
                                </>
                              )}
                              {donor.type === "material" && (
                                <>
                                  Ofereceu{" "}
                                  <span className="font-semibold text-[#228B22]">
                                    {donor.description?.trim() || "material"}
                                  </span>
                                </>
                              )}
                              {donor.type === "volunteer" && (
                                <>
                                  Disponibilizou <span className="font-semibold text-[#228B22]">voluntariado</span>
                                </>
                              )}
                            </p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* CTA Section */}
        {visibleDonors.length > 0 && (
          <section className="bg-[#f3f6f2] py-12 md:py-16">
            <div className="container max-w-7xl px-4 text-center">
              <h2 className="text-3xl font-bold text-[#2d2d2d] mb-3">Junte-se a Essa Comunidade</h2>
              <p className="text-[#6d6d6d] mb-8 max-w-2xl mx-auto">
                Sua contribuição, assim como a desses doadores, faz a diferença. Escolha compartilhar seu nome para inspirar outros.
              </p>
              <a
                href="/campaigns"
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#228B22] px-7 font-semibold text-white transition hover:bg-[#1b711b] active:scale-[0.97]"
              >
                <Heart className="mr-2 h-5 w-5" aria-hidden="true" /> Fazer uma Doação
              </a>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
