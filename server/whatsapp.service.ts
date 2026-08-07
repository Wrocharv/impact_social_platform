// Serviço para gerenciar conversas e estado do chatbot WhatsApp

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";

type FallbackCampaign = {
  id: number;
  title: string;
  description: string;
  longDescription?: string;
  category: string;
  goal: number;
  vipApartmentAmountCents?: number;
  vipContributionTitle?: string | null;
  vipContributionSubtitle?: string | null;
  vipContributionDescription?: string | null;
  helpTierOptions?: string[] | string | null;
  raised: number;
  status: "active" | "completed" | "paused" | "archived";
  imageUrl?: string;
  vipImageUrls?: string[];
  vipVideoUrls?: string[];
  needs?: Array<{
    id: number;
    campaignId: number;
    type: "material" | "labor" | "equipment" | "other";
    name: string;
    description?: string;
    quantity: string;
    targetQuantityExact?: number | null;
    unitValueCents?: number | null;
    priority: "high" | "medium" | "low";
    fulfilled?: number | null;
  }>;
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
const fallbackCampaignsFile = process.env.WHATSAPP_FALLBACK_CAMPAIGNS_FILE?.trim()
  ? path.resolve(process.cwd(), process.env.WHATSAPP_FALLBACK_CAMPAIGNS_FILE.trim())
  : path.resolve(process.cwd(), "server", ".whatsapp-fallback-campaigns.json");

function extensionForMediaMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/ogg") return "ogv";
  if (mimeType === "video/quicktime") return "mov";
  return "bin";
}

function cleanMediaName(value: string) {
  return value.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, "-").slice(0, 120);
}

function persistDataUrlLocally(dataUrl: string, fileBaseName: string) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) return null;

  const uploadsDir = path.resolve(process.cwd(), "client", "public", "uploads", "campaigns");
  mkdirSync(uploadsDir, { recursive: true });

  const extension = extensionForMediaMimeType(mimeType);
  const safeBase = cleanMediaName(fileBaseName) || "campaign-media";
  const fileName = `${Date.now()}-${safeBase}.${extension}`;
  const absolutePath = path.join(uploadsDir, fileName);
  writeFileSync(absolutePath, bytes);

  return `/uploads/campaigns/${fileName}`;
}

function normalizeMediaValue(value: unknown, fileBaseName: string) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (!trimmed.startsWith("data:")) return trimmed;

  try {
    return persistDataUrlLocally(trimmed, fileBaseName) ?? undefined;
  } catch (error) {
    console.warn("[WhatsApp] Unable to persist data URL locally:", error);
    return undefined;
  }
}

function normalizeMediaList(values: unknown, fileBasePrefix: string) {
  if (!Array.isArray(values)) return undefined;

  return values
    .map((value, index) => normalizeMediaValue(value, `${fileBasePrefix}-${index}`))
    .filter((value): value is string => Boolean(value));
}

function loadFallbackCampaignsFromDisk(): FallbackCampaign[] {
  try {
    if (!existsSync(fallbackCampaignsFile)) return [];

    const raw = readFileSync(fallbackCampaignsFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => ({
      ...item,
      vipImageUrls: Array.isArray(item.vipImageUrls) ? item.vipImageUrls.filter((value: unknown) => typeof value === "string") : undefined,
      vipVideoUrls: Array.isArray(item.vipVideoUrls) ? item.vipVideoUrls.filter((value: unknown) => typeof value === "string") : undefined,
      createdAt: new Date(item.createdAt),
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
    })) as FallbackCampaign[];
  } catch (error) {
    console.warn("[WhatsApp] Unable to load fallback campaigns from disk:", error);
    return [];
  }
}

function persistFallbackCampaignsToDisk(options?: { allowDeletes?: boolean }) {
  try {
    mkdirSync(path.dirname(fallbackCampaignsFile), { recursive: true });
    const loadedFromDisk = loadFallbackCampaignsFromDisk();

    const mergedById = new Map<number, FallbackCampaign>();
    for (const campaign of loadedFromDisk) {
      mergedById.set(campaign.id, campaign);
    }
    for (const campaign of fallbackCampaigns) {
      mergedById.set(campaign.id, campaign);
    }

    const nextRows = options?.allowDeletes
      ? fallbackCampaigns.slice()
      : Array.from(mergedById.values()).sort((a, b) => a.id - b.id);

    const tmpPath = `${fallbackCampaignsFile}.tmp`;
    const backupPath = `${fallbackCampaignsFile}.bak`;
    if (existsSync(fallbackCampaignsFile)) {
      copyFileSync(fallbackCampaignsFile, backupPath);
    }
    writeFileSync(tmpPath, JSON.stringify(nextRows, null, 2));
    renameSync(tmpPath, fallbackCampaignsFile);

    fallbackCampaigns.length = 0;
    fallbackCampaigns.push(...nextRows);
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
    vipApartmentAmountCents?: number;
    vipContributionTitle?: string | null;
    vipContributionSubtitle?: string | null;
    vipContributionDescription?: string | null;
    helpTierOptions?: string[] | string | null;
    vipImageUrls?: string[];
    vipVideoUrls?: string[];
    raised?: number;
    longDescription?: string;
    imageUrl?: string;
    needs?: Array<{
      type: "material" | "labor" | "equipment" | "other";
      name: string;
      description?: string;
      quantity: string;
      targetQuantityExact?: number;
      unitValueCents?: number;
      priority?: "high" | "medium" | "low";
    }>;
  }) {
    refreshFallbackCampaignsFromDisk();
    const highestExistingId = fallbackCampaigns.length > 0
      ? Math.max(...fallbackCampaigns.map((campaign) => campaign.id))
      : 0;
    const nextId = Math.max(100000, highestExistingId + 1);

    const campaign: FallbackCampaign = {
      id: nextId,
      title: data.title,
      description: data.description,
      longDescription: data.longDescription ?? data.description,
      category: data.category,
      goal: data.goal,
      vipApartmentAmountCents: Math.max(1, Number(data.vipApartmentAmountCents ?? 12_000_000)),
      vipContributionTitle: data.vipContributionTitle ?? null,
      vipContributionSubtitle: data.vipContributionSubtitle ?? null,
      vipContributionDescription: data.vipContributionDescription ?? null,
      helpTierOptions: data.helpTierOptions,
      raised: Math.max(0, Number(data.raised ?? 0)),
      status: "active",
      imageUrl: normalizeMediaValue(data.imageUrl, `campaign-${nextId}-cover`) ?? "/obra-paredes.jpg",
      vipImageUrls: normalizeMediaList(data.vipImageUrls, `campaign-${nextId}-vip-image`),
      vipVideoUrls: normalizeMediaList(data.vipVideoUrls, `campaign-${nextId}-vip-video`),
      needs: (data.needs ?? []).map((need, index) => ({
        id: Date.now() + index,
        campaignId: nextId,
        type: need.type,
        name: need.name,
        description: need.description,
        quantity: need.quantity,
        targetQuantityExact: need.targetQuantityExact ?? null,
        unitValueCents: need.unitValueCents ?? null,
        priority: need.priority ?? "medium",
        fulfilled: 0,
      })),
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
        "title" | "description" | "longDescription" | "goal" | "vipApartmentAmountCents" | "vipContributionTitle" | "vipContributionSubtitle" | "vipContributionDescription" | "helpTierOptions" | "vipImageUrls" | "vipVideoUrls" | "raised" | "status" | "imageUrl"
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
      vipApartmentAmountCents: data.vipApartmentAmountCents !== undefined
        ? Math.max(1, Number(data.vipApartmentAmountCents))
        : current.vipApartmentAmountCents,
      vipContributionTitle: data.vipContributionTitle !== undefined ? data.vipContributionTitle : current.vipContributionTitle,
      vipContributionSubtitle: data.vipContributionSubtitle !== undefined ? data.vipContributionSubtitle : current.vipContributionSubtitle,
      vipContributionDescription: data.vipContributionDescription !== undefined ? data.vipContributionDescription : current.vipContributionDescription,
      helpTierOptions: data.helpTierOptions !== undefined ? data.helpTierOptions : current.helpTierOptions,
      imageUrl: data.imageUrl !== undefined
        ? normalizeMediaValue(data.imageUrl, `campaign-${id}-cover`) ?? undefined
        : current.imageUrl,
      vipImageUrls: data.vipImageUrls !== undefined
        ? normalizeMediaList(data.vipImageUrls, `campaign-${id}-vip-image`)
        : current.vipImageUrls,
      vipVideoUrls: data.vipVideoUrls !== undefined
        ? normalizeMediaList(data.vipVideoUrls, `campaign-${id}-vip-video`)
        : current.vipVideoUrls,
      raised: data.raised !== undefined ? Math.max(0, Number(data.raised)) : current.raised,
      updatedAt: new Date(),
    };

    fallbackCampaigns[index] = next;
    persistFallbackCampaignsToDisk();
    return next;
  },

  addFallbackCampaignNeed(
    campaignId: number,
    need: {
      type: "material" | "labor" | "equipment" | "other";
      name: string;
      description?: string;
      quantity: string;
      targetQuantityExact?: number;
      unitValueCents?: number;
      priority?: "high" | "medium" | "low";
    },
  ) {
    refreshFallbackCampaignsFromDisk();
    const campaignIndex = fallbackCampaigns.findIndex((campaign) => campaign.id === campaignId);
    if (campaignIndex < 0) return null;

    const currentCampaign = fallbackCampaigns[campaignIndex];
    const currentNeeds = currentCampaign.needs ?? [];
    const maxExistingNeedId = fallbackCampaigns
      .flatMap((campaign) => campaign.needs ?? [])
      .reduce((max, item) => Math.max(max, item.id), 0);

    const nextNeed = {
      id: Math.max(maxExistingNeedId + 1, Date.now()),
      campaignId,
      type: need.type,
      name: need.name,
      description: need.description,
      quantity: need.quantity,
      targetQuantityExact: need.targetQuantityExact ?? null,
      unitValueCents: need.unitValueCents ?? null,
      priority: need.priority ?? "medium",
      fulfilled: 0,
    };

    fallbackCampaigns[campaignIndex] = {
      ...currentCampaign,
      needs: [...currentNeeds, nextNeed],
      updatedAt: new Date(),
    };

    persistFallbackCampaignsToDisk();
    return nextNeed;
  },

  removeFallbackCampaignNeed(campaignId: number, needId: number) {
    refreshFallbackCampaignsFromDisk();
    const campaignIndex = fallbackCampaigns.findIndex((campaign) => campaign.id === campaignId);
    if (campaignIndex < 0) return false;
    const currentCampaign = fallbackCampaigns[campaignIndex];
    fallbackCampaigns[campaignIndex] = {
      ...currentCampaign,
      needs: (currentCampaign.needs ?? []).filter((need) => need.id !== needId),
      updatedAt: new Date(),
    };
    persistFallbackCampaignsToDisk();
    return true;
  },

  updateFallbackCampaignNeed(campaignId: number, needId: number, fields: Record<string, unknown>) {
    refreshFallbackCampaignsFromDisk();
    const campaignIndex = fallbackCampaigns.findIndex((campaign) => campaign.id === campaignId);
    if (campaignIndex < 0) return false;
    const currentCampaign = fallbackCampaigns[campaignIndex];
    fallbackCampaigns[campaignIndex] = {
      ...currentCampaign,
      needs: (currentCampaign.needs ?? []).map((need) =>
        need.id === needId ? { ...need, ...fields } : need,
      ),
      updatedAt: new Date(),
    };
    persistFallbackCampaignsToDisk();
    return true;
  },

  deleteFallbackCampaign(id: number) {
    refreshFallbackCampaignsFromDisk();
    const index = fallbackCampaigns.findIndex((campaign) => campaign.id === id);
    if (index < 0) return false;

    fallbackCampaigns.splice(index, 1);

    persistFallbackCampaignsToDisk({ allowDeletes: true });
    return true;
  },

  resetFallbackCampaigns() {
    fallbackCampaigns.length = 0;
    persistFallbackCampaignsToDisk({ allowDeletes: true });
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
