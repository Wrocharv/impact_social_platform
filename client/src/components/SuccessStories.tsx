import { Card } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export type SuccessStory = {
  id: number;
  title: string;
  location: string | null;
  beforeImage: string;
  afterImage: string;
  description: string;
  completionDate: Date | string | null;
};

export default function SuccessStories({ stories = [] }: { stories?: SuccessStory[] }) {
  return (
    <section className="bg-white py-16 md:py-24" aria-labelledby="success-stories-title">
      <div className="container max-w-7xl px-4">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#228B22]">Histórias de sucesso</p>
          <h2 id="success-stories-title" className="mt-3 text-4xl font-bold text-[#2d2d2d]">Transformações com evidências</h2>
        </div>

        {stories.length === 0 ? (
          <Card className="border-dashed p-10 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-[#228B22]" aria-hidden="true" />
            <h3 className="mt-4 text-2xl font-semibold text-[#2d2d2d]">Nenhuma história publicada</h3>
            <p className="mx-auto mt-2 max-w-2xl text-[#656565]">
              Fotos de antes e depois aparecerão somente após conclusão, autorização e validação da campanha.
            </p>
          </Card>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {stories.map((story) => (
              <Card key={story.id} className="overflow-hidden">
                <div className="grid grid-cols-2">
                  <StoryImage src={story.beforeImage} alt={`Antes — ${story.title}`} label="Antes" />
                  <StoryImage src={story.afterImage} alt={`Depois — ${story.title}`} label="Depois" />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-[#2d2d2d]">{story.title}</h3>
                  {story.location && <p className="mt-1 text-sm text-[#787878]">{story.location}</p>}
                  <p className="mt-4 leading-relaxed text-[#656565]">{story.description}</p>
                  {story.completionDate && (
                    <p className="mt-4 text-sm font-semibold text-[#228B22]">
                      Concluída em {new Date(story.completionDate).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StoryImage({ src, alt, label }: { src: string; alt: string; label: string }) {
  return (
    <figure className="relative aspect-[4/3] bg-[#edf2ec]">
      <img src={src} alt={alt} className="h-full w-full object-cover" />
      <figcaption className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white">
        {label}
      </figcaption>
    </figure>
  );
}
