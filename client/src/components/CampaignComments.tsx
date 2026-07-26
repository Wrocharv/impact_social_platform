import { Card } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";

interface CampaignCommentsProps {
  campaignId: number | string;
}

export default function CampaignComments({ campaignId }: CampaignCommentsProps) {
  return (
    <Card className="border-dashed p-8 text-center" data-campaign-id={campaignId}>
      <MessageCircle className="mx-auto h-9 w-9 text-[#228B22]" aria-hidden="true" />
      <h3 className="mt-4 text-xl font-bold text-[#2d2d2d]">Mural ainda não disponível</h3>
      <p className="mx-auto mt-2 max-w-xl text-[#656565]">
        O mural será liberado depois que persistência, autenticação, moderação e denúncia estiverem implementadas. Nenhuma mensagem demonstrativa é exibida.
      </p>
    </Card>
  );
}
