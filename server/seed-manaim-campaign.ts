import { eq, or } from "drizzle-orm";
import { campaignNeeds, campaignUpdates, campaigns } from "../drizzle/schema";
import { getDb } from "./db";

async function seedManaimCampaign() {
  const db = await getDb();
  if (!db) {
    console.error("[seed] DATABASE_URL não configurada ou banco indisponível.");
    process.exitCode = 1;
    return;
  }

  const existing = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(or(eq(campaigns.title, "Construção Hotel Recanto de Paz"), eq(campaigns.title, "Construção Hotel Recanto de Paz - Apoie a obra")))
    .limit(1);

  if (existing[0]) {
    console.log(`[seed] Campanha já existe com id ${existing[0].id}.`);
    return;
  }

  const [campaign] = await db
    .insert(campaigns)
    .values({
      title: "Construção Hotel Recanto de Paz",
      description: "Apoie a construção do Hotel Recanto de Paz com materiais e contribuições para a obra.",
      longDescription:
        "Esta campanha reúne apoio para a construção do Hotel Recanto de Paz, incluindo materiais básicos, logística e serviços essenciais. A ideia é transformar a obra em um projeto comunitário com acompanhamento e transparência.",
      goal: 10_000_00,
      imageUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80",
      createdBy: 1,
      status: "active",
    })
    .$returningId();

  await db.insert(campaignNeeds).values({
    campaignId: campaign.id,
    type: "material",
    name: "Cimento",
    description: "Materiais essenciais para a fase inicial da construção.",
    quantity: "200 sacos",
    priority: "high",
    fulfilled: 0,
  });

  await db.insert(campaignUpdates).values([
    {
      campaignId: campaign.id,
      title: "Fundação iniciada",
      description:
        "A equipe já concluiu a marcação do terreno e iniciou a concretagem das fundações. O próximo passo será o assentamento de blocos e a chegada de mais materiais de construção.",
      phase: "before",
      imageUrls: JSON.stringify([
        "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80",
      ]),
      videoUrls: JSON.stringify([]),
    },
    {
      campaignId: campaign.id,
      title: "Estrutura em andamento",
      description:
        "Já temos as primeiras divisórias e o contorno da obra visíveis. Cada nova foto mostrará a evolução real do Hotel Recanto de Paz e a contribuição dos apoiadores.",
      phase: "during",
      imageUrls: JSON.stringify([
        "https://images.unsplash.com/photo-1516455590571-18256e5bb9ff?auto=format&fit=crop&w=1200&q=80",
      ]),
      videoUrls: JSON.stringify([]),
    },
    {
      campaignId: campaign.id,
      title: "Obra avançando para a fase final",
      description:
        "O projeto está caminhando para a etapa de fechamento e acabamento. Esta atualização mostra como a obra evoluiu desde a fundação até as primeiras instalações relevantes.",
      phase: "after",
      imageUrls: JSON.stringify([
        "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
      ]),
      videoUrls: JSON.stringify([]),
    },
  ]);

  console.log(`[seed] Campanha criada com id ${campaign.id}, necessidade de cimento registrada e atualizações iniciais adicionadas.`);
}

void seedManaimCampaign();
