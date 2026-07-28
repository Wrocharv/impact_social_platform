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
          "3️⃣ /contribuir - Fazer uma doação/oferta\n" +
          "4️⃣ /atualizar - Publicar atualização\n" +
          "5️⃣ /necessidade - Registrar necessidade\n" +
          "6️⃣ /detalhes - Ver detalhes de uma campanha\n" +
          "7️⃣ /ajuda - Ver ajuda\n" +
          "8️⃣ /menu - Ver este menu novamente";
      } else if (mensagem === "/contribuir") {
        resposta =
          "*Fazer uma Contribuição* 💝\n\n" +
          "Qual tipo de contribuição você gostaria de fazer?\n\n" +
          "1️⃣ /contrib-financeira - Doação em dinheiro\n" +
          "2️⃣ /contrib-material - Doação de materiais\n" +
          "3️⃣ /contrib-voluntario - Oferecer mão de obra";
      } else if (mensagem === "/contrib-financeira") {
        resposta =
          "*Doação Financeira* 💰\n\n" +
          "Qual é o valor (em reais)?\n" +
          "Ex: 100 (para R$ 100,00)";
        whatsappService.updateConversation(phoneNumber, {
          step: "adding_contribution",
          contributionData: { type: "financial" },
        });
      } else if (mensagem === "/contrib-material") {
        resposta =
          "*Doação de Material* 📦\n\n" +
          "Descreva o material que você gostaria de doar:\n" +
          "Ex: Cimento, tijolos, tintas, etc.";
        whatsappService.updateConversation(phoneNumber, {
          step: "adding_contribution",
          contributionData: { type: "material" },
        });
      } else if (mensagem === "/contrib-voluntario") {
        resposta =
          "*Oferta de Voluntariado* 🤝\n\n" +
          "Descreva sua profissão ou tipo de trabalho:\n" +
          "Ex: Pedreiro, eletricista, pintor, etc.";
        whatsappService.updateConversation(phoneNumber, {
          step: "adding_contribution",
          contributionData: { type: "volunteer" },
        });
      } else if (mensagem === "/detalhes") {
        const db = await getDb();
        if (!db) {
          resposta = "❌ Banco indisponível. Tente novamente em alguns minutos.";
        } else {
          const allCampaigns = await db.select().from(campaigns).limit(5);
          if (allCampaigns.length === 0) {
            resposta = "❌ Nenhuma campanha encontrada.";
          } else {
            const lista = allCampaigns
              .map((c, i) => `${i + 1}. ${c.title}`)
              .join("\n");
            resposta =
              "*Qual campanha?*\n\n" +
              `${lista}\n\n` +
              "Digite o número correspondente";
            whatsappService.updateConversation(phoneNumber, {
              step: "viewing_campaign",
              selectedCampaignId: undefined,
            });
          }
        }

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
          "/campanhas - Ver campanhas ativas\n" +
          "/criar - Criar nova campanha\n" +
          "/contribuir - Fazer uma doação/oferta\n" +
          "/atualizar - Publicar atualização\n" +
          "/necessidade - Registrar necessidade\n" +
          "/detalhes - Ver detalhes de campanha\n" +
          "/ajuda - Ver esta ajuda";
      } else if (mensagem === "/atualizar") {
        const db = await getDb();
        if (!db) {
          resposta = "❌ Banco indisponível.";
        } else {
          const allCampaigns = await db.select().from(campaigns).limit(5);
          if (allCampaigns.length === 0) {
            resposta = "❌ Nenhuma campanha encontrada.";
          } else {
            const lista = allCampaigns
              .map((c, i) => `${i + 1}. ${c.title}`)
              .join("\n");
            resposta =
              "*Qual campanha você quer atualizar?*\n\n" +
              `${lista}\n\n` +
              "Digite o número correspondente";
            whatsappService.updateConversation(phoneNumber, {
              step: "adding_update",
            });
          }
        }
      } else if (mensagem === "/necessidade") {
        const db = await getDb();
        if (!db) {
          resposta = "❌ Banco indisponível.";
        } else {
          const allCampaigns = await db.select().from(campaigns).limit(5);
          if (allCampaigns.length === 0) {
            resposta = "❌ Nenhuma campanha encontrada.";
          } else {
            const lista = allCampaigns
              .map((c, i) => `${i + 1}. ${c.title}`)
              .join("\n");
            resposta =
              "*Qual campanha precisa da necessidade?*\n\n" +
              `${lista}\n\n` +
              "Digite o número correspondente";
            whatsappService.updateConversation(phoneNumber, {
              step: "adding_need",
            });
          }
        }

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
      } else if (
        whatsappService.getConversation(phoneNumber)?.step === "adding_contribution"
      ) {
        // Fluxo de contribuição
        const state = whatsappService.getConversation(phoneNumber);
        const contrib = state.contributionData || {};

        if (!contrib.amount && contrib.type === "financial") {
          const amount = Number(Body.trim());
          if (!Number.isFinite(amount) || amount <= 0) {
            resposta = "Valor inválido. Digite apenas números positivos. Ex: 100";
          } else {
            resposta = "Ótimo! Agora preciso de seus dados:\n\nQual é o seu *nome completo*?";
            whatsappService.updateConversation(phoneNumber, {
              step: "adding_contribution",
              contributionData: { ...contrib, amount },
            });
          }
        } else if (!contrib.donorName) {
          resposta = `Nome registrado: "${Body}"\n\nQual é o seu *WhatsApp*?\n(Com DDD, ex: 11999999999)`;
          whatsappService.updateConversation(phoneNumber, {
            step: "adding_contribution",
            contributionData: { ...contrib, donorName: Body },
          });
        } else if (!contrib.donorWhatsapp) {
          resposta = `WhatsApp registrado: ${Body}\n\nQual é a sua *cidade*?`;
          whatsappService.updateConversation(phoneNumber, {
            step: "adding_contribution",
            contributionData: { ...contrib, donorWhatsapp: Body },
          });
        } else if (!contrib.donorCity) {
          resposta = `Cidade: ${Body}\n\n✅ *Contribuição Registrada!*\n\n`;
          if (contrib.type === "financial") {
            resposta += `💰 Doação: R$ ${contrib.amount?.toFixed(2)}\n`;
          } else if (contrib.type === "material") {
            resposta += `📦 Material: ${contrib.description}\n`;
          } else {
            resposta += `🤝 Voluntariado: ${contrib.description}\n`;
          }
          resposta += `👤 Doador: ${contrib.donorName}\n📍 Cidade: ${Body}\n\nA equipe entrará em contato em breve!\n\n/menu para voltar`;
          whatsappService.resetConversation(phoneNumber);
        } else if (contrib.type !== "financial" && !contrib.description) {
          resposta = `Descreva sua ${contrib.type === "material" ? "doação de material" : "oferta de voluntariado"}:`;
          whatsappService.updateConversation(phoneNumber, {
            step: "adding_contribution",
            contributionData: { ...contrib, donorCity: Body },
          });
        }
      } else if (
        whatsappService.getConversation(phoneNumber)?.step === "viewing_campaign"
      ) {
        const db = await getDb();
        if (!db) {
          resposta = "❌ Banco indisponível.";
        } else {
          const allCampaigns = await db.select().from(campaigns).limit(5);
          const index = Number(Body.trim()) - 1;
          if (index >= 0 && index < allCampaigns.length) {
            const campaign = allCampaigns[index];
            resposta =
              `*${campaign.title}*\n\n` +
              `📝 ${campaign.description}\n` +
              `💰 Meta: R$ ${(campaign.goal / 100).toFixed(2)}\n` +
              `📊 Arrecadado: R$ ${(campaign.raised / 100).toFixed(2)}\n` +
              `🏷️ Categoria: ${campaign.category}\n` +
              `📅 Criada em: ${new Date(campaign.createdAt).toLocaleDateString("pt-BR")}\n\n` +
              `/contribuir para fazer uma doação\n` +
              `/menu para voltar`;
            whatsappService.resetConversation(phoneNumber);
          } else {
            resposta = "Número inválido. Tente novamente.";
          }
        }
      } else if (
        whatsappService.getConversation(phoneNumber)?.step === "adding_update"
      ) {
        // Fluxo de atualização
        const state = whatsappService.getConversation(phoneNumber);
        const update = state.updateData || {};

        if (!update.title) {
          resposta = `Qual é o *título* da atualização?\nEx: Estrutura pronta para cobertura`;
          whatsappService.updateConversation(phoneNumber, {
            step: "adding_update",
            updateData: { ...update, title: Body },
          });
        } else if (!update.description) {
          resposta = `Descrição: "${Body}"\n\nDescreva os detalhes da atualização:`;
          whatsappService.updateConversation(phoneNumber, {
            step: "adding_update",
            updateData: { ...update, title: Body, description: Body },
          });
        } else {
          resposta = `✅ *Atualização Registrada!*\n\nTítulo: ${update.title}\n\nA equipe aprovará em breve!\n\n/menu para voltar`;
          whatsappService.resetConversation(phoneNumber);
        }
      } else if (
        whatsappService.getConversation(phoneNumber)?.step === "adding_need"
      ) {
        // Fluxo de necessidade
        const state = whatsappService.getConversation(phoneNumber);
        const need = state.needData || {};

        if (!need.name) {
          resposta = `Qual é o *nome* da necessidade?\nEx: Cimento, blocos, tijolos`;
          whatsappService.updateConversation(phoneNumber, {
            step: "adding_need",
            needData: { ...need, name: Body },
          });
        } else if (!need.quantity) {
          resposta = `Qual é a quantidade necessária?\nEx: 200 sacos`;
          whatsappService.updateConversation(phoneNumber, {
            step: "adding_need",
            needData: { ...need, name: Body, quantity: Body },
          });
        } else {
          resposta = `✅ *Necessidade Registrada!*\n\n${need.name}\nQuantidade: ${need.quantity}\n\nA equipe revisará em breve!\n\n/menu para voltar`;
          whatsappService.resetConversation(phoneNumber);
        }
      } else {
        resposta =
          `Desculpe, não entendi. 🤔\n\n` +
          `Comandos disponíveis:\n` +
          `/start - Menu principal\n` +
          `/campanhas - Ver campanhas\n` +
          `/criar - Criar campanha\n` +
          `/contribuir - Fazer doação\n` +
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
