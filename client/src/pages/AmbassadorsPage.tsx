import PublicHeader from "@/components/PublicHeader";
import { Card } from "@/components/ui/card";
import { Award, ChevronLeft, Link2, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

export default function AmbassadorsPage() {
  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <main className="container max-w-5xl px-4 py-12 md:py-20">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#4f6550] hover:text-[#228B22]">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao início
        </Link>
        <div className="mx-auto mt-10 max-w-3xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#228B22]/10">
            <Award className="h-8 w-8 text-[#228B22]" aria-hidden="true" />
          </div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">Programa de embaixadores</p>
          <h1 className="mt-3 text-4xl font-bold text-[#2d2d2d] md:text-6xl">Divulgação com atribuição verificável</h1>
          <p className="mt-5 text-lg leading-relaxed text-[#656565]">O programa está sendo conectado ao banco para que cada link, contribuição aprovada e posição no ranking seja calculado com dados reais.</p>
        </div>

        <Card className="mx-auto mt-10 max-w-3xl border-[#a87508]/25 bg-[#fffaf0] p-7 md:p-9">
          <div className="flex gap-4">
            <ShieldCheck className="h-7 w-7 flex-none text-[#a87508]" aria-hidden="true" />
            <div>
              <h2 className="text-xl font-bold text-[#2d2d2d]">Ranking temporariamente indisponível</h2>
              <p className="mt-3 leading-relaxed text-[#656565]">Nenhum nome, valor ou posição demonstrativa é exibido. A classificação será liberada somente quando a atribuição de contribuições aprovadas estiver implementada e testada.</p>
            </div>
          </div>
        </Card>

        <div className="mx-auto mt-6 grid max-w-3xl gap-5 sm:grid-cols-2">
          <Card className="p-6">
            <Link2 className="h-7 w-7 text-[#228B22]" aria-hidden="true" />
            <h2 className="mt-4 font-bold text-[#2d2d2d]">Próxima etapa: links persistidos</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#656565]">Cada embaixador terá um código estável criado no servidor e associado à sua conta.</p>
          </Card>
          <Card className="p-6">
            <Award className="h-7 w-7 text-[#228B22]" aria-hidden="true" />
            <h2 className="mt-4 font-bold text-[#2d2d2d]">Ranking por pagamentos aprovados</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#656565]">Somente contribuições confirmadas pelo gateway serão contabilizadas.</p>
          </Card>
        </div>
      </main>
    </div>
  );
}
