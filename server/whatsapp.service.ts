// Serviço para gerenciar conversas e estado do chatbot WhatsApp

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

type FallbackCampaign = {
  id: number;
  title: string;
  description: string;
  longDescription?: string;
  category: string;
  goal: number;
  raised: number;
  status: "active" | "completed";
  imageUrl?: string;
  createdBy?: number;
  createdAt: Date;
  updatedAt?: Date;
};

type ConversationState = {
  phoneNumber: string;
  step:
    | "idle"
    | "creating_campaign"
    | "creating_campaign_title"
    | "creating_campaign_description"
    | "creating_campaign_goal"
    | "creating_campaign_category"
    | "editing_campaign"
    | "adding_update"
    | "adding_need"
    | "adding_contribution"
    | "viewing_campaign";
  campaignData?: {
    title?: string;
    description?: string;
    goal?: string | number;
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
const fallbackCampaignsFile = path.resolve(process.cwd(), "server", ".whatsapp-fallback-campaigns.json");

function loadFallbackCampaignsFromDisk(): FallbackCampaign[] {
  try {
    if (!existsSync(fallbackCampaignsFile)) return [];

    const raw = readFileSync(fallbackCampaignsFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt),
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
    })) as FallbackCampaign[];
  } catch (error) {
    console.warn("[WhatsApp] Unable to load fallback campaigns from disk:", error);
    return [];
  }
}

function persistFallbackCampaignsToDisk() {
  try {
    mkdirSync(path.dirname(fallbackCampaignsFile), { recursive: true });
    writeFileSync(fallbackCampaignsFile, JSON.stringify(fallbackCampaigns, null, 2));
  } catch (error) {
    console.warn("[WhatsApp] Unable to persist fallback campaigns:", error);
  }
}

const fallbackCampaigns: FallbackCampaign[] = loadFallbackCampaignsFromDisk();

function refreshFallbackCampaignsFromDisk() {
  const loaded = loadFallbackCampaignsFromDisk();
  fallbackCampaigns.length = 0;
  fallbackCampaigns.push(...loaded);
}

export const whatsappService = {
  // Limpar conversas antigas (mais de 30 min)
  cleanupOldConversations() {
    const now = new Date();
    for (const [key, value] of Array.from(conversations.entries())) {
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

  getFallbackCampaigns() {
    refreshFallbackCampaignsFromDisk();
    return fallbackCampaigns.slice();
  },

  createFallbackCampaign(data: {
    title: string;
    description: string;
    category: string;
    goal: number;
    raised?: number;
    longDescription?: string;
    imageUrl?: string;
  }) {
    const nextId = fallbackCampaigns.length > 0
      ? Math.max(...fallbackCampaigns.map((campaign) => campaign.id)) + 1
      : 1;

    const campaign: FallbackCampaign = {
      id: nextId,
      title: data.title,
      description: data.description,
      longDescription: data.longDescription ?? data.description,
      category: data.category,
      goal: data.goal,
      raised: Math.max(0, Number(data.raised ?? 0)),
      status: "active",
      imageUrl: data.imageUrl ?? "/obra-paredes.jpg",
      createdBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    fallbackCampaigns.push(campaign);
    persistFallbackCampaignsToDisk();
    return campaign;
  },

  updateFallbackCampaign(
    id: number,
    data: Partial<
      Pick<
        FallbackCampaign,
        "title" | "description" | "longDescription" | "goal" | "raised" | "status" | "imageUrl"
      >
    >,
  ) {
    refreshFallbackCampaignsFromDisk();
    const index = fallbackCampaigns.findIndex((campaign) => campaign.id === id);
    if (index < 0) return null;

    const current = fallbackCampaigns[index];
    const next: FallbackCampaign = {
      ...current,
      ...data,
      goal: data.goal !== undefined ? Math.max(0, Number(data.goal)) : current.goal,
      raised: data.raised !== undefined ? Math.max(0, Number(data.raised)) : current.raised,
      updatedAt: new Date(),
    };

    fallbackCampaigns[index] = next;
    persistFallbackCampaignsToDisk();
    return next;
  },

  resetFallbackCampaigns() {
    fallbackCampaigns.length = 0;
    persistFallbackCampaignsToDisk();
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
