import express, { Request, Response } from "express";
import { whatsappService } from "./whatsapp.service";

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

// Função auxiliar para enviar mensagem via Twilio
async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM ?? process.env.WHATSAPP_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    console.error("[WhatsApp] Credenciais do Twilio não configuradas");
    return;
  }

  try {
    // Fazer requisição direta à API do Twilio (sem SDK)
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const normalizedTo = to.startsWith("+") ? to : `+${to}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: `whatsapp:${from}`,
        To: `whatsapp:${normalizedTo}`,
        Body: body,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[WhatsApp] Erro ao enviar:", error);
    } else {
      console.log(`[WhatsApp] Mensagem enviada para +${to}`);
    }
  } catch (error) {
    console.error("[WhatsApp] Erro na requisição:", error);
  }
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
        resposta =
          "*Campanhas Ativas* 📋\n\n" +
          "🏗️ *Construção Hotel Recanto de Paz*\n" +
          "Arrecadado: R$ 0,00\n" +
          "Meta: R$ 10.000,00\n\n" +
          "Digite /criar para criar uma nova campanha\n" +
          "ou /menu para voltar ao menu principal";
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
          resposta =
            `Meta: R$ ${Body},00\n\n` +
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
              goal: Body,
            },
          });
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

          resposta =
            `✅ *Campanha Criada com Sucesso!*\n\n` +
            `📋 *${state.campaignData?.title}*\n` +
            `📝 ${state.campaignData?.description}\n` +
            `💰 Meta: R$ ${state.campaignData?.goal}\n` +
            `🏷️ Categoria: ${category}\n\n` +
            `/menu para voltar ao menu principal`;

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
