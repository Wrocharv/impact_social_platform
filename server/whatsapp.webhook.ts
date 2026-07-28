import express, { Request, Response } from "express";
import { whatsappService } from "./whatsapp.service";
import { getDb } from "./db";
import { campaigns } from "../drizzle/schema";

// Webhook para receber mensagens da Twilio/WhatsApp
export const whatsappWebhook = express.Router();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Rota para Twilio Webhook (POST)
whatsappWebhook.post("/webhook", async (req: Request, res: Response) => {
  try {
    const { From, Body } = req.body;

    if (!From || !Body) {
      return res
        .status(400)
        .type("text/xml")
        .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Extrair número de telefone (remover "whatsapp:" do Twilio)
    const phoneNumber = From.replace("whatsapp:", "").replace("+", "");

    console.log(`[WhatsApp] Mensagem recebida de +${phoneNumber}: ${Body}`);

    // Processar mensagem e responder via TwiML (formato esperado pelo Twilio)
    try {
      // Simular chamada ao router de WhatsApp
      // Em uma implementação real, você poderia usar o contexto do tRPC
      const mensagem = Body.toLowerCase().trim();

      let resposta = "";

      if (mensagem === "/start" || mensagem === "/menu") {
        resposta =
          "*Bem-vindo ao Parceria do Bem!* 🙏\n\n" +
          "Escolha uma opção:\n\n" +
          "1️⃣ /campanhas - Ver campanhas ativas\n" +
          "2️⃣ /criar - Criar nova campanha\n" +
          "3️⃣ /atualizar - Publicar atualização\n" +
          "4️⃣ /necessidade - Registrar necessidade\n" +
          "5️⃣ /ajuda - Ver ajuda\n" +
          "6️⃣ /menu - Ver este menu novamente";
      } else if (mensagem === "/campanhas") {
        const db = await getDb();

        if (!db) {
          resposta =
            "❌ Banco de dados indisponível no momento.\n\n" +
            "Tente novamente em alguns minutos.";
        } else {
          const allCampaigns = await db.select().from(campaigns).limit(5);
          if (allCampaigns.length === 0) {
            resposta = "❌ Nenhuma campanha criada ainda.\n\nDigite /criar para criar a primeira.";
          } else {
            const lista = allCampaigns
              .map(
                (c, i) =>
                  `${i + 1}. ${c.title}\n💰 R$ ${(c.raised / 100).toFixed(2)} / R$ ${(
                    c.goal / 100
                  ).toFixed(2)}`
              )
              .join("\n\n");

            resposta =
              "*Campanhas Ativas* 📋\n\n" +
              `${lista}\n\n` +
              "Digite /criar para criar uma nova campanha\n" +
              "ou /menu para voltar ao menu principal";
          }
        }
      } else if (mensagem === "/criar") {
        resposta =
          "*Criar Nova Campanha* 📝\n\n" +
          "Qual é o *título* da sua campanha?\n" +
          "(Responda com o título e continuaremos)";
        whatsappService.updateConversation(phoneNumber, {
          step: "creating_campaign",
          campaignData: {},
        });
      } else if (mensagem === "/ajuda") {
        resposta =
          "*Ajuda* ❓\n\n" +
          "/start - Menu principal\n" +
          "/campanhas - Ver campanhas\n" +
          "/criar - Criar campanha\n" +
          "/atualizar - Publicar atualização\n" +
          "/necessidade - Registrar necessidade\n" +
          "/ajuda - Ver ajuda";
      } else if (
        whatsappService
          .getConversation(phoneNumber)
          ?.step.includes("creating_campaign")
      ) {
        // Processar entrada do wizard de criação de campanha
        const state = whatsappService.getConversation(phoneNumber);

        if (!state.campaignData?.title) {
          resposta = `Ótimo! Campanha: "${Body}"\n\nAgora descreva a campanha em uma frase:`;
          whatsappService.updateConversation(phoneNumber, {
            step: "creating_campaign",
            campaignData: {
              title: Body,
            },
          });
        } else if (!state.campaignData?.description) {
          resposta = `Descrição: "${Body}"\n\nQual é a meta em reais?\n(Ex: 10000)`;
          whatsappService.updateConversation(phoneNumber, {
            step: "creating_campaign",
            campaignData: {
              ...state.campaignData,
              description: Body,
            },
          });
        } else if (!state.campaignData?.goal) {
          const goalNumber = Number(Body.replace(/\./g, "").replace(",", "."));
          if (!Number.isFinite(goalNumber) || goalNumber <= 0) {
            resposta = "Valor inválido. Informe apenas números para a meta. Ex: 10000";
          } else {
          resposta =
            `Meta: R$ ${goalNumber.toFixed(2)}\n\n` +
            `Qual é a categoria?\n` +
            `1️⃣ Moradia\n` +
            `2️⃣ Educação\n` +
            `3️⃣ Saúde\n` +
            `4️⃣ Alimentação\n` +
            `5️⃣ Infraestrutura\n` +
            `6️⃣ Outro`;
          whatsappService.updateConversation(phoneNumber, {
            step: "creating_campaign",
            campaignData: {
              ...state.campaignData,
              goal: String(goalNumber),
            },
          });
          }
        } else if (!state.campaignData?.category) {
          const categories = [
            "moradia",
            "educacao",
            "saude",
            "alimentacao",
            "infraestrutura",
            "outro",
          ];
          const category = categories[parseInt(Body) - 1] || "outro";

          const db = await getDb();
          if (!db) {
            resposta =
              "❌ Banco de dados indisponível no momento.\n\n" +
              "Não consegui salvar a campanha agora. Tente novamente em alguns minutos.";
          } else {
            const goalInCents = Math.round(Number(state.campaignData?.goal || "0") * 100);
            await db.insert(campaigns).values({
              title: state.campaignData?.title || "Campanha sem título",
              description: state.campaignData?.description || "",
              longDescription: state.campaignData?.description || "",
              category: category as "moradia" | "educacao" | "saude" | "alimentacao" | "infraestrutura" | "outro",
              goal: goalInCents,
              imageUrl: "/obra-paredes.jpg",
              createdBy: 1,
              status: "active",
            });

            resposta =
              `✅ *Campanha Criada com Sucesso!*\n\n` +
              `📋 *${state.campaignData?.title}*\n` +
              `📝 ${state.campaignData?.description}\n` +
              `💰 Meta: R$ ${Number(state.campaignData?.goal || "0").toFixed(2)}\n` +
              `🏷️ Categoria: ${category}\n\n` +
              `/menu para voltar ao menu principal`;
          }

          whatsappService.resetConversation(phoneNumber);
        }
      } else {
        resposta =
          `Desculpe, não entendi. 🤔\n\n` +
          `Comandos disponíveis:\n` +
          `/start - Menu principal\n` +
          `/campanhas - Ver campanhas\n` +
          `/criar - Criar campanha\n` +
          `/ajuda - Ver ajuda`;
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(
        resposta || "Comando recebido. Use /menu para ver as opções."
      )}</Message></Response>`;
      return res.status(200).type("text/xml").send(twiml);
    } catch (error) {
      console.error("[WhatsApp] Erro ao processar mensagem:", error);
      const twiml =
        '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.</Message></Response>';
      return res.status(200).type("text/xml").send(twiml);
    }
  } catch (error) {
    console.error("[WhatsApp] Webhook error:", error);
    res
      .status(500)
      .type("text/xml")
      .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

// Rota para validação do webhook (GET)
whatsappWebhook.get("/webhook", (req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    message: "WhatsApp webhook is running",
  });
});


// Rota de teste (simular mensagem)
whatsappWebhook.post("/test", async (req: Request, res: Response) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ error: "Missing phoneNumber or message" });
    }

    console.log(`[WhatsApp Test] ${phoneNumber}: ${message}`);

    // Aqui você testaria o processamento
    res.status(200).json({
      success: true,
      phoneNumber,
      message,
      note: "Test mode - integração com Twilio necessária",
    });
  } catch (error) {
    console.error("[WhatsApp Test] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
