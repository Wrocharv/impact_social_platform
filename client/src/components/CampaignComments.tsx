import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { MessageCircle, SendHorizonal } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

interface CampaignCommentsProps {
  campaignId: number | string;
}

export default function CampaignComments({ campaignId }: CampaignCommentsProps) {
  const numericCampaignId = useMemo(() => Number(campaignId), [campaignId]);
  const [content, setContent] = useState("");
  const utils = trpc.useUtils();

  const commentsQuery = trpc.campaigns.getComments.useQuery(
    { campaignId: numericCampaignId },
    { enabled: Number.isInteger(numericCampaignId) && numericCampaignId > 0 },
  );

  const createComment = trpc.campaigns.createComment.useMutation({
    onSuccess: async () => {
      setContent("");
      await utils.campaigns.getComments.invalidate({ campaignId: numericCampaignId });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    createComment.mutate({ campaignId: numericCampaignId, content: trimmedContent });
  };

  return (
    <div className="space-y-4" data-campaign-id={campaignId}>
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-[#228B22]/10 p-2">
            <MessageCircle className="h-5 w-5 text-[#228B22]" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#2d2d2d]">Mural de apoio</h3>
            <p className="mt-1 text-sm text-[#656565]">
              Deixe uma mensagem de apoio. Comentários passam por moderação antes de ficarem visíveis.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Escreva uma mensagem de apoio para esta campanha..."
            rows={4}
            maxLength={2000}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[#787878]">Seu comentário ficará visível após aprovação.</p>
            <Button type="submit" className="gap-2" disabled={createComment.isPending || !content.trim()}>
              <SendHorizonal className="h-4 w-4" aria-hidden="true" />
              {createComment.isPending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-3">
        {commentsQuery.isLoading ? (
          <Card className="p-5 text-sm text-[#656565]">Carregando comentários...</Card>
        ) : commentsQuery.isError ? (
          <Card className="p-5 text-sm text-[#a87508]">Não foi possível carregar os comentários neste momento.</Card>
        ) : commentsQuery.data?.length ? (
          commentsQuery.data.map((comment) => (
            <Card key={comment.id} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[#2d2d2d]">{comment.authorName || "Apoiador"}</p>
                <p className="text-xs text-[#787878]">
                  {new Date(comment.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#656565]">{comment.content}</p>
            </Card>
          ))
        ) : (
          <Card className="border-dashed p-7 text-center text-sm text-[#656565]">
            Ainda não há mensagens aprovadas para esta campanha. Seja o primeiro a deixar uma palavra de apoio.
          </Card>
        )}
      </div>
    </div>
  );
}
