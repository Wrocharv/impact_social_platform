import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SITE_CONTENT, getSiteContent, mergeSiteContent, saveSiteContent } from "./siteContent";

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

describe("site content helpers", () => {
  beforeEach(() => {
    installTestStorage();
  });

  it("retorna o conteúdo padrão quando nada foi salvo", () => {
    expect(getSiteContent()).toEqual(DEFAULT_SITE_CONTENT);
  });

  it("reaplica os ajustes salvos do admin no conteúdo público", () => {
    globalThis.localStorage.setItem("parceria-do-bem:site-content", JSON.stringify({ heroTitle: "Título alterado", presentationVideoUrl: "/video-novo.mp4" }));

    expect(getSiteContent()).toEqual({
      ...DEFAULT_SITE_CONTENT,
      heroTitle: "Título alterado",
      presentationVideoUrl: "/video-novo.mp4",
    });
  });

  it("salva e reaplica ajustes do painel em localhost", () => {
    const saved = saveSiteContent({ heroTitle: "Título local", presentationVideoUrl: "/video-local.mp4" });

    expect(saved).toEqual({
      ...DEFAULT_SITE_CONTENT,
      heroTitle: "Título local",
      presentationVideoUrl: "/video-local.mp4",
    });
    expect(getSiteContent()).toEqual(saved);
  });
});
