import { describe, expect, it } from "vitest";
import { groupByCampaign, type PublicDonor } from "./publicDonors";

function donor(overrides: Partial<PublicDonor> & { id: number }): PublicDonor {
  return {
    donorName: "Doador",
    donorCity: "Rio Verde",
    type: "financial",
    description: null,
    campaignId: null,
    campaignTitle: null,
    ...overrides,
  };
}

describe("groupByCampaign", () => {
  it("separa os doadores por campanha", () => {
    const groups = groupByCampaign([
      donor({ id: 1, campaignId: 10, campaignTitle: "Casa da Dona Ana", donorName: "Ana" }),
      donor({ id: 2, campaignId: 20, campaignTitle: "Reforma do Salão", donorName: "Bruno" }),
      donor({ id: 3, campaignId: 10, campaignTitle: "Casa da Dona Ana", donorName: "Carla" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe("Casa da Dona Ana");
    expect(groups[0].donors.map((row) => row.donorName)).toEqual(["Ana", "Carla"]);
    expect(groups[1].title).toBe("Reforma do Salão");
  });

  it("põe a campanha com mais doadores primeiro", () => {
    const groups = groupByCampaign([
      donor({ id: 1, campaignId: 10, campaignTitle: "Poucos" }),
      donor({ id: 2, campaignId: 20, campaignTitle: "Muitos" }),
      donor({ id: 3, campaignId: 20, campaignTitle: "Muitos" }),
    ]);

    expect(groups.map((group) => group.title)).toEqual(["Muitos", "Poucos"]);
  });

  it("joga contribuições sem campanha para o fim, sob um título próprio", () => {
    const groups = groupByCampaign([
      donor({ id: 1, campaignId: null }),
      donor({ id: 2, campaignId: 10, campaignTitle: "Casa da Dona Ana" }),
    ]);

    expect(groups.map((group) => group.title)).toEqual(["Casa da Dona Ana", "Outras contribuições"]);
  });

  it("nunca carrega valor: o doador publico so tem nome, cidade e tipo", () => {
    const [group] = groupByCampaign([
      donor({ id: 1, campaignId: 10, campaignTitle: "Casa da Dona Ana" }),
    ]);

    expect(group.donors[0]).not.toHaveProperty("amount");
  });
});
