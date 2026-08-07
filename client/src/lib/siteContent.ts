const SITE_CONTENT_STORAGE_KEY = "parceria-do-bem:site-content";
const fallbackSiteContentStore = new Map<string, string>();

function getSiteContentStorage(): Storage | null {
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
    return globalThis.localStorage as Storage;
  }

  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage;
  }

  return null;
}

export type SiteContent = {
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string;
  presentationVideoUrl: string;
  presentationTitle: string;
  presentationDescription: string;
};

export const DEFAULT_SITE_CONTENT: SiteContent = {
  heroTitle: "Juntos Transformamos Vidas",
  heroSubtitle: "Cada contribuição se transforma em cuidado, dignidade e esperança para quem mais precisa.",
  heroImageUrl: "https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=1600&q=80",
  presentationVideoUrl: "/uploads/campaigns/1786077021954-copy_76A6A7E0-0A61-4EE3-8056-0F87AFEE0B8C.mov",
  presentationTitle: "Veja o propósito e o objetivo deste projeto",
  presentationDescription: "Conheça algumas de nossas ações e seja um doador, seja um parceiro do bem.",
};

function readStoredSiteContent(): Partial<SiteContent> | null {
  const storage = getSiteContentStorage();
  const raw = storage?.getItem(SITE_CONTENT_STORAGE_KEY) ?? fallbackSiteContentStore.get(SITE_CONTENT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function getSiteContent(): SiteContent {
  const stored = readStoredSiteContent();
  if (!stored) return DEFAULT_SITE_CONTENT;

  return {
    ...DEFAULT_SITE_CONTENT,
    ...(stored ?? {}),
  };
}

export function saveSiteContent(partial: Partial<SiteContent>): SiteContent {
  const next = mergeSiteContent(partial);

  const storage = getSiteContentStorage();
  if (storage) {
    storage.setItem(SITE_CONTENT_STORAGE_KEY, JSON.stringify(next));
  } else {
    fallbackSiteContentStore.set(SITE_CONTENT_STORAGE_KEY, JSON.stringify(next));
  }

  return next;
}

export function mergeSiteContent(partial: Partial<SiteContent> = {}): SiteContent {
  const stored = readStoredSiteContent();
  return {
    ...DEFAULT_SITE_CONTENT,
    ...(stored ?? {}),
    ...partial,
  };
}
