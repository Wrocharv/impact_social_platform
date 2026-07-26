import PublicHeader from "@/components/PublicHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Heart, Users } from "lucide-react";

export default function DonorsPage() {
  const donorsQuery = trpc.contributions.getPublicDonors.useQuery();
  const donors = donorsQuery.data ?? [];

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
                <h1 className="text-4xl font-bold text-[#2d2d2d] md:text-5xl">Nossos Doadores</h1>
                <p className="mt-3 text-lg text-[#6d6d6d] max-w-2xl">
                  Conheça as pessoas que escolheram contribuir e construir um futuro melhor junto conosco.
                </p>
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
                  <p className="mt-3 text-3xl font-bold text-[#228B22]">{donors.length}</p>
                </Card>
                <Card className="p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#4f6550]">Impacto Combinado</p>
                  <p className="mt-3 text-3xl font-bold text-[#228B22]">Múltiplos</p>
                </Card>
              </div>
            )}
          </div>
        </section>

        {/* Donors Grid */}
        <section className="py-16 md:py-20">
          <div className="container max-w-7xl px-4">
            {donorsQuery.isLoading ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 rounded-xl" />
                ))}
              </div>
            ) : donors.length === 0 ? (
              <Card className="border-dashed p-10 text-center">
                <Users className="mx-auto h-10 w-10 text-[#228B22]" aria-hidden="true" />
                <h3 className="mt-4 text-2xl font-semibold text-[#2d2d2d]">Primeira doação em breve!</h3>
                <p className="mx-auto mt-2 max-w-2xl text-[#6d6d6d]">
                  Quando os primeiros doadores decidirem compartilhar seus nomes, eles aparecerão aqui como reconhecimento de sua generosidade.
                </p>
              </Card>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {donors.map((donor) => (
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
                        {donor.type === "financial" && donor.amount && (
                          <>
                            Doou{" "}
                            <span className="font-bold text-[#228B22]">
                              R$ {(donor.amount / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                          </>
                        )}
                        {donor.type === "material" && (
                          <>
                            Ofereceu <span className="font-semibold text-[#228B22]">material</span>
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
            )}
          </div>
        </section>

        {/* CTA Section */}
        {donors.length > 0 && (
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
