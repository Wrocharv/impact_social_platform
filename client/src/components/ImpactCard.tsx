import { Heart, Package, Users, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ImpactStats {
  totalRaised: number;
  totalContributions: number;
  activeCampaigns: number;
  totalDonors: number;
}

type ImpactCardProps = {
  stats: ImpactStats | null;
  isLoading: boolean;
};

const formatCurrency = (value: number) =>
  (value / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function ImpactCard({ stats, isLoading }: ImpactCardProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  const impactItems = [
    {
      icon: Heart,
      label: "Valor total arrecadado",
      value: stats ? formatCurrency(stats.totalRaised) : "R$ 0",
      color: "from-red-50 to-pink-50",
      iconColor: "text-red-600",
    },
    {
      icon: Package,
      label: "Doações confirmadas",
      value: stats?.totalContributions ?? 0,
      unit: "contribuições",
      color: "from-blue-50 to-cyan-50",
      iconColor: "text-blue-600",
    },
    {
      icon: Zap,
      label: "Campanhas ativas",
      value: stats?.activeCampaigns ?? 0,
      unit: "campanhas",
      color: "from-yellow-50 to-orange-50",
      iconColor: "text-yellow-600",
    },
    {
      icon: Users,
      label: "Pessoas impactadas",
      value: stats?.totalDonors ?? 0,
      unit: "doadores",
      color: "from-green-50 to-emerald-50",
      iconColor: "text-green-600",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {impactItems.map((item, idx) => {
        const Icon = item.icon;
        return (
          <div
            key={idx}
            className={`rounded-lg border border-[#e7e7e7] bg-gradient-to-br ${item.color} p-6 transition hover:-translate-y-1 hover:shadow-md`}
          >
            <div className={`mb-4 inline-flex items-center justify-center rounded-full bg-white p-3 shadow-sm`}>
              <Icon className={`h-5 w-5 ${item.iconColor}`} aria-hidden="true" />
            </div>
            <p className="mb-2 text-sm text-[#6d6d6d]">{item.label}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#2d2d2d]">{item.value}</span>
              {item.unit && <span className="text-xs text-[#999]">{item.unit}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
