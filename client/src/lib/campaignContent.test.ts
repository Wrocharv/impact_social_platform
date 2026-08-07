import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CAMPAIGN_CONTENT, getCampaignContent, mergeCampaignContent, saveCampaignContent } from "./campaignContent";

function installTestStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

describe("campaign content helpers", () => {
  beforeEach(() => {
    installTestStorage();
  });

  it("retorna o conteúdo padrão quando nada foi salvo", () => {
    expect(getCampaignContent(42)).toEqual({
      ...DEFAULT_CAMPAIGN_CONTENT,
      campaignId: 42,
    });
  });

  it("reaplica os ajustes salvos do admin para a campanha pública", () => {
    globalThis.localStorage.setItem("parceria-do-bem:campaign-content:42", JSON.stringify({ title: "Campanha alterada", videoUrls: ["/video-campanha.mp4"] }));

    expect(getCampaignContent(42)).toEqual({
      ...DEFAULT_CAMPAIGN_CONTENT,
      campaignId: 42,
      title: "Campanha alterada",
      videoUrls: ["/video-campanha.mp4"],
    });
  });

  it("salva e reaplica ajustes do painel para campanhas em localhost", () => {
    const saved = saveCampaignContent(7, { title: "Campanha local", videoUrls: ["/video-local.mp4"] });

    expect(saved).toEqual({
      ...DEFAULT_CAMPAIGN_CONTENT,
      campaignId: 7,
      title: "Campanha local",
      videoUrls: ["/video-local.mp4"],
    });
    expect(getCampaignContent(7)).toEqual(saved);
  });

  it("mergeCampaignContent preserva valores existentes e substitui os informados", () => {
    const merged = mergeCampaignContent(9, {
      title: "Atualizado",
      description: "Descrição nova",
      galleryImageUrls: ["/nova.jpg"],
    });

    expect(merged.campaignId).toBe(9);
    expect(merged.title).toBe("Atualizado");
    expect(merged.description).toBe("Descrição nova");
    expect(merged.galleryImageUrls).toEqual(["/nova.jpg"]);
  });
});
