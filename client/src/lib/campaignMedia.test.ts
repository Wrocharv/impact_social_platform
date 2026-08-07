import { describe, expect, it } from "vitest";

import { resolveCampaignImageUrl } from "./campaignMedia";

describe("resolveCampaignImageUrl", () => {
  it("preserva uma URL direta digitada pelo administrador", () => {
    expect(resolveCampaignImageUrl("https://cdn.exemplo.com/foto.jpg")).toBe("https://cdn.exemplo.com/foto.jpg");
  });

  it("usa a URL do upload quando não há valor direto", () => {
    expect(resolveCampaignImageUrl("", "https://cdn.exemplo.com/upload.jpg")).toBe("https://cdn.exemplo.com/upload.jpg");
  });

  it("retorna undefined quando não há valor nem upload", () => {
    expect(resolveCampaignImageUrl("   ", undefined)).toBeUndefined();
  });
});
