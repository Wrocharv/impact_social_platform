import express, { Request, Response } from "express";
import { whatsappRouter } from "./whatsapp.router";
import { getDb } from "./db";

// Webhook para receber mensagens da Twilio/WhatsApp
export const whatsappWebhook = express.Router();

// Rota para Twilio Webhook (POST)
whatsappWebhook.post("/webhook", async (req: Request, res: Response) => {
  try {
    const { From, Body } = req.body;

    if (!From || !Body) {
      return res.status(400).json({ error: "Missing From or Body" });
    }

    // Extrair número de telefone (remover "whatsapp:" do Twilio)
    const phoneNumber = From.replace("whatsapp:", "").replace("+", "");

    // Processar mensagem via tRPC
    // Nota: Aqui você precisaria de uma forma de chamar o tRPC externamente
    // Por enquanto, vamos fazer uma chamada direta ao router

    console.log(`[WhatsApp] Mensagem recebida de ${phoneNumber}: ${Body}`);

    // Resposta imediata ao Twilio
    res.status(200).json({
      success: true,
      message: "Mensagem recebida",
    });

    // Processar e enviar resposta (em produção, usaria Twilio SDK)
    // twilioClient.messages.create({
    //   from: 'whatsapp:+14155238886', // seu número Twilio
    //   to: `whatsapp:+${phoneNumber}`,
    //   body: response
    // });
  } catch (error) {
    console.error("[WhatsApp] Webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Rota para status (GET)
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
