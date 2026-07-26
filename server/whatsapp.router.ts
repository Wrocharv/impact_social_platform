import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { whatsappService } from "./whatsapp.service";
import { getDb } from "./db";
import { campaigns, campaignUpdates, campaignNeeds } from "../drizzle/schema";

export const whatsappRouter = router({
  // Receber e processar mensagem WhatsApp
  handleMessage: publicProcedure
    .input(
      z.object({
        phoneNumber: z.string(),
        message: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { phoneNumber, message } = input;
      const db = await getDb();

      // Limpar conversas antigas
      whatsappService.cleanupOldConversations();

      // Obter conversação atual
      const conversation = whatsappService.getConversation(phoneNumber);
      const { command, args } = whatsappService.parseMessage(message);

      let response = "";

      try {
        // Menu principal
        if (command === "start" || command === "menu" || conversation.step === "idle") {
          whatsappService.resetConversation(phoneNumber);
          response = `
👋 *Bem-vindo ao Parceiros do Bem!*

Escolha uma opção:

📋 */campanhas* - Ver todas as campanhas
➕ */criar* - Criar nova campanha
✏️ */atualizar* - Publicar atualização
📌 */necessidade* - Registrar necessidade
❓ */ajuda* - Ver todos os comandos
`;
        }

        // Listar campanhas
        else if (command === "campanhas") {
          if (!db) {
            response = "❌ Banco de dados não disponível";
            return { response, phoneNumber };
          }

          const allCampaigns = await db.select().from(campaigns).limit(5);

          if (allCampaigns.length === 0) {
            response = "❌ Nenhuma campanha criada ainda\n\n*/criar* para criar uma nova";
          } else {
            response = `📊 *Campanhas Ativas*\n\n${allCampaigns
              .map(
                (c, i) =>
                  `${i + 1}. ${c.title}\n💰 R$ ${(c.raised / 100).toFixed(2)} / R$ ${(c.goal / 100).toFixed(2)}\n`
              )
              .join("\n")}
*Digite o número* para ver detalhes\n\n*/menu* voltar`;
          }

          // Salvar que está vendo campanhas
          whatsappService.updateConversation(phoneNumber, {
            step: "idle",
            campaignData: {},
          });
        }

        // Criar campanha
        else if (command === "criar") {
          whatsappService.updateConversation(phoneNumber, {
            step: "creating_campaign",
            campaignData: {},
          });
          response = `✏️ *Nova Campanha*\n\n*Passo 1 de 5*\n\n📌 Qual o *título* da campanha?\n\n(ex: Construção da Escola)`;
        }

        // Se está criando campanha
        else if (conversation.step === "creating_campaign") {
          const currentData = conversation.campaignData || {};

          if (!currentData.title) {
            whatsappService.updateConversation(phoneNumber, {
              step: "creating_campaign",
              campaignData: { ...currentData, title: message },
            });
            response = `✅ Título: *${message}*\n\n*Passo 2 de 5*\n\n📝 Qual a *descrição curta* da campanha?\n\n(ex: Ajude a construir a nova escola comunitária)`;
          } else if (!currentData.description) {
            whatsappService.updateConversation(phoneNumber, {
              step: "creating_campaign",
              campaignData: { ...currentData, description: message },
            });
            response = `✅ Descrição: *${message}*\n\n*Passo 3 de 5*\n\n💰 Qual a *meta em reais*?\n\n(ex: 50000)`;
          } else if (!currentData.goal) {
            whatsappService.updateConversation(phoneNumber, {
              step: "creating_campaign",
              campaignData: { ...currentData, goal: message },
            });
            response = `✅ Meta: *R$ ${message}*\n\n*Passo 4 de 5*\n\n🏷️ Qual a *categoria*?\n\n1️⃣ Moradia\n2️⃣ Educação\n3️⃣ Saúde\n4️⃣ Alimentação\n5️⃣ Infraestrutura\n6️⃣ Outro`;
          } else if (!currentData.category) {
            const categoryMap: Record<string, string> = {
              "1": "moradia",
              "2": "educacao",
              "3": "saude",
              "4": "alimentacao",
              "5": "infraestrutura",
              "6": "outro",
            };
            const category = categoryMap[message] || "outro";

            if (!db) {
              response = "❌ Banco de dados não disponível";
              return { response, phoneNumber };
            }

            // Criar campanha
            const [newCampaign] = await db
              .insert(campaigns)
              .values({
                title: currentData.title!,
                description: currentData.description!,
                longDescription: currentData.description!,
                category: category as any,
                goal: Math.round(Number(currentData.goal!) * 100),
                imageUrl: "/obra-paredes.jpg",
                createdBy: 1,
                status: "active",
              })
              .$returningId();

            whatsappService.resetConversation(phoneNumber);
            response = `✅ *Campanha Criada com Sucesso!*\n\n📌 ${currentData.title}\n💰 Meta: R$ ${currentData.goal}\n🏷️ Categoria: ${category}\n\n*/menu* para continuar`;
          }
        }

        // Ajuda
        else if (command === "ajuda") {
          response = `❓ *Comandos Disponíveis*\n
📋 */campanhas* - Ver campanhas
➕ */criar* - Criar campanha
✏️ */atualizar* - Publicar atualização
📌 */necessidade* - Registrar necessidade
🎯 */menu* - Menu principal
❓ */ajuda* - Este menu`;
        }

        // Comando não reconhecido
        else {
          response = `❌ Comando não reconhecido\n\n*/ajuda* para ver os comandos disponíveis\n*/menu* para voltar ao menu principal`;
        }
      } catch (error) {
        console.error("[WhatsApp] Erro:", error);
        response = "❌ Erro ao processar. Tente novamente.\n\n*/menu* para voltar";
        whatsappService.resetConversation(phoneNumber);
      }

      return {
        response,
        phoneNumber,
        step: whatsappService.getConversation(phoneNumber).step,
      };
    }),
});
