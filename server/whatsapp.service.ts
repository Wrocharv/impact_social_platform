// Serviço para gerenciar conversas e estado do chatbot WhatsApp

type ConversationState = {
  phoneNumber: string;
  step: "idle" | "creating_campaign" | "editing_campaign" | "adding_update" | "adding_need" | "adding_contribution" | "viewing_campaign";
  campaignData?: {
    title?: string;
    description?: string;
    goal?: string;
    category?: string;
  };
  updateData?: {
    title?: string;
    description?: string;
    phase?: "before" | "during" | "after";
    imageUrl?: string;
  };
  needData?: {
    name?: string;
    description?: string;
    quantity?: string;
    priority?: "high" | "medium" | "low";
    type?: "material" | "labor" | "equipment" | "other";
  };
  contributionData?: {
    type?: "financial" | "material" | "volunteer";
    amount?: number;
    description?: string;
    donorName?: string;
    donorWhatsapp?: string;
    donorEmail?: string;
    donorCity?: string;
  };
  selectedCampaignId?: number;
  timestamp: Date;
};

const conversations = new Map<string, ConversationState>();

export const whatsappService = {
  // Limpar conversas antigas (mais de 30 min)
  cleanupOldConversations() {
    const now = new Date();
    for (const [key, value] of conversations.entries()) {
      const diff = now.getTime() - value.timestamp.getTime();
      if (diff > 30 * 60 * 1000) {
        conversations.delete(key);
      }
    }
  },

  getConversation(phoneNumber: string): ConversationState {
    return conversations.get(phoneNumber) || {
      phoneNumber,
      step: "idle",
      timestamp: new Date(),
    };
  },

  updateConversation(phoneNumber: string, data: Partial<ConversationState>) {
    const current = this.getConversation(phoneNumber);
    conversations.set(phoneNumber, {
      ...current,
      ...data,
      timestamp: new Date(),
    });
  },

  resetConversation(phoneNumber: string) {
    conversations.set(phoneNumber, {
      phoneNumber,
      step: "idle",
      timestamp: new Date(),
    });
  },

  formatCampaignList(campaigns: any[]): string {
    if (campaigns.length === 0) return "❌ Nenhuma campanha encontrada";
    
    return campaigns
      .slice(0, 5)
      .map((c, i) => `${i + 1}. ${c.title}\n   R$ ${(c.raised / 100).toFixed(2)} / R$ ${(c.goal / 100).toFixed(2)}`)
      .join("\n");
  },

  parseMessage(text: string): { command: string; args: string[] } {
    const trimmed = text.toLowerCase().trim();
    
    if (trimmed.startsWith("/")) {
      const parts = trimmed.split(" ");
      return {
        command: parts[0].substring(1),
        args: parts.slice(1),
      };
    }

    // Try to parse as number (for selecting campaign)
    if (/^\d+$/.test(trimmed)) {
      return { command: "select", args: [trimmed] };
    }

    return { command: "text", args: [trimmed] };
  },
};

export type { ConversationState };
