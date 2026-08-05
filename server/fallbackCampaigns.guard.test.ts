import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

type FallbackCampaign = {
  id: number;
  goal: number;
  imageUrl?: string | null;
};

describe("fallback campaign guardrails", () => {
  it("mantem a campanha LEGENDARIOS com meta e imagem esperadas", () => {
    const filePath = path.resolve(process.cwd(), "server", ".whatsapp-fallback-campaigns.json");
    const campaigns = JSON.parse(readFileSync(filePath, "utf8")) as FallbackCampaign[];

    const legendarios = campaigns.find((campaign) => campaign.id === 100002);

    expect(legendarios).toBeDefined();
    expect(legendarios?.goal).toBe(10_000_000);
    expect(legendarios?.imageUrl).toBeTypeOf("string");
    expect(String(legendarios?.imageUrl)).toMatch(/^data:image\//);
  });
});
