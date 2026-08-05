import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

type FallbackCampaign = {
  id: number;
  title?: string;
  goal: number;
  vipApartmentAmountCents?: number;
  imageUrl?: string | null;
  needs?: Array<unknown>;
};

describe("fallback campaign guardrails", () => {
  it("mantem a campanha do Hotel Recanto com meta, VIP e materiais", () => {
    const filePath = path.resolve(process.cwd(), "server", ".whatsapp-fallback-campaigns.json");
    const campaigns = JSON.parse(readFileSync(filePath, "utf8")) as FallbackCampaign[];

    const hotel = campaigns.find((campaign) => campaign.id === 100001);

    expect(hotel).toBeDefined();
    expect(String(hotel?.title ?? "").toLowerCase()).toContain("hotel recanto de paz");
    expect(hotel?.goal).toBeGreaterThan(0);
    expect(hotel?.vipApartmentAmountCents).toBeGreaterThan(0);
    expect(Array.isArray(hotel?.needs)).toBe(true);
    expect((hotel?.needs ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("mantem a campanha LEGENDARIOS com meta e imagem esperadas", () => {
    const filePath = path.resolve(process.cwd(), "server", ".whatsapp-fallback-campaigns.json");
    const campaigns = JSON.parse(readFileSync(filePath, "utf8")) as FallbackCampaign[];

    const legendarios = campaigns.find((campaign) => campaign.id === 100002);

    expect(legendarios).toBeDefined();
    expect(legendarios?.goal).toBeGreaterThan(100_000);
    expect(legendarios?.goal).toBe(1_500_000);
    expect(legendarios?.imageUrl).toBeTypeOf("string");
    expect(String(legendarios?.imageUrl)).toMatch(/^data:image\//);
  });
});
