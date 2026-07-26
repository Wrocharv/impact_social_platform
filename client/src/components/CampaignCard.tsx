import { Card } from "@/components/ui/card";
import { ChevronRight, Heart, Handshake } from "lucide-react";
import { Link } from "wouter";

type CampaignCardProps = {
  campaign: {
    id: number;
    title: string;
    description: string;
    goal: number;
    raised: number;
    remaining: number;
    progress: number;
    imageUrl: string | null;
    status: "active" | "completed" | "paused" | "archived";
  };
};

const formatCurrency = (value: number) =>
  (value / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function CampaignCard({ campaign }: CampaignCardProps) {
  const isCompleted = campaign.status === "completed";

  return (
    <Link href={`/campaign/${campaign.id}`} className="block h-full">
      <Card className="group flex h-full cursor-pointer flex-col overflow-hidden border-[#e7e7e7] transition duration-200 hover:-translate-y-1 hover:shadow-xl">
        <div className="relative h-52 overflow-hidden bg-[#eaf4ea]">
          {campaign.imageUrl ? (
            <img
              src={campaign.imageUrl}
              alt={`Imagem da campanha ${campaign.title}`}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Heart className="h-14 w-14 text-[#228B22]/45" aria-hidden="true" />
            </div>
          )}
          <span className="absolute right-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-[#227a22] shadow-sm">
            {isCompleted ? "Concluída" : "Em andamento"}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-6">
          <h3 className="mb-2 line-clamp-2 text-xl font-bold text-[#2d2d2d]">{campaign.title}</h3>
          <p className="mb-2 line-clamp-3 text-sm leading-relaxed text-[#6d6d6d]">
            {campaign.description}
          </p>
          <p className="mb-5 text-sm font-semibold text-[#228B22]">Obra em andamento com atualizações e fotos reais.</p>

          <div className="mt-auto">
            <div
              className="h-2 overflow-hidden rounded-full bg-[#dcdcdc]"
              role="progressbar"
              aria-label={`Progresso da campanha ${campaign.title}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={campaign.progress}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#228B22] to-[#62ad4d] transition-transform duration-500 motion-reduce:transition-none"
                style={{ transform: `scaleX(${campaign.progress / 100})`, transformOrigin: "left" }}
              />
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold text-[#228B22]">{formatCurrency(campaign.raised)}</span>
              <span className="text-[#6d6d6d]">{campaign.progress}% da meta</span>
            </div>
            <p className="mt-1 text-xs text-[#787878]">
              {isCompleted
                ? `Meta alcançada: ${formatCurrency(campaign.goal)}`
                : `Faltam ${formatCurrency(campaign.remaining)}`}
            </p>
            <div className="mt-5 flex items-center font-semibold text-[#228B22]">
              Ver campanha <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
