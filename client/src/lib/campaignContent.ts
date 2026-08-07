const CAMPAIGN_CONTENT_STORAGE_KEY_PREFIX = "parceria-do-bem:campaign-content:";
const fallbackCampaignContentStore = new Map<string, string>();

function getCampaignContentStorage(): Storage | null {
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
    return globalThis.localStorage as Storage;
  }

  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage;
  }

  return null;
}

export type CampaignContent = {
  campaignId: number;
  title: string;
  subtitle: string;
  description: string;
  longDescription: string;
  heroImageUrl: string;
  galleryImageUrls: string[];
  videoUrls: string[];
};

export const DEFAULT_CAMPAIGN_CONTENT: Omit<CampaignContent, "campaignId"> = {
  title: "",
  subtitle: "",
  description: "",
  longDescription: "",
  heroImageUrl: "",
  galleryImageUrls: [],
  videoUrls: [],
};

function readStoredCampaignContent(campaignId: number): Partial<CampaignContent> | null {
  const storage = getCampaignContentStorage();
  const raw = storage?.getItem(`${CAMPAIGN_CONTENT_STORAGE_KEY_PREFIX}${campaignId}`)
    ?? fallbackCampaignContentStore.get(`${CAMPAIGN_CONTENT_STORAGE_KEY_PREFIX}${campaignId}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function getCampaignContent(campaignId: number): CampaignContent {
  const stored = readStoredCampaignContent(campaignId);
  return {
    ...DEFAULT_CAMPAIGN_CONTENT,
    ...(stored ?? {}),
    campaignId,
  } as CampaignContent;
}

export function saveCampaignContent(campaignId: number, partial: Partial<CampaignContent>): CampaignContent {
  const next = mergeCampaignContent(campaignId, partial);

  const storage = getCampaignContentStorage();
  if (storage) {
    storage.setItem(`${CAMPAIGN_CONTENT_STORAGE_KEY_PREFIX}${campaignId}`, JSON.stringify(next));
  } else {
    fallbackCampaignContentStore.set(`${CAMPAIGN_CONTENT_STORAGE_KEY_PREFIX}${campaignId}`, JSON.stringify(next));
  }

  return next;
}

export function mergeCampaignContent(campaignId: number, partial: Partial<CampaignContent> = {}): CampaignContent {
  const stored = readStoredCampaignContent(campaignId);
  const merged = {
    ...DEFAULT_CAMPAIGN_CONTENT,
    ...(stored ?? {}),
    ...partial,
    campaignId,
  } as CampaignContent;

  if (partial.galleryImageUrls !== undefined) {
    merged.galleryImageUrls = partial.galleryImageUrls;
  }

  if (partial.videoUrls !== undefined) {
    merged.videoUrls = partial.videoUrls;
  }

  return merged;
}
