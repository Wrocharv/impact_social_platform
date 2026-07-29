import { describe, expect, it, beforeEach } from "vitest";
import { whatsappService } from "./whatsapp.service";

describe("whatsappService fallback campaigns", () => {
  beforeEach(() => {
    whatsappService.resetFallbackCampaigns();
  });

  it("creates and lists campaigns when the database is unavailable", () => {
    const created = whatsappService.createFallbackCampaign({
      title: "Campanha de teste",
      description: "Ajuda comunitária",
      category: "infraestrutura",
      goal: 5000,
    });

    expect(created.title).toBe("Campanha de teste");

    const campaigns = whatsappService.getFallbackCampaigns();
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].title).toBe("Campanha de teste");
    expect(campaigns[0].goal).toBe(5000);
  });
});
