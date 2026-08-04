import { describe, expect, it } from "vitest";
import { getMaterialContributionCopy, shouldShowMaterialContributionOption } from "./contributionFlow";

describe("contribution flow helpers", () => {
  it("shows the material/kit option for the Legendário campaign even without explicit needs", () => {
    const result = shouldShowMaterialContributionOption({
      campaignTitle: "Legendario Solidario",
      campaignNeeds: [],
      currentType: null,
      initialType: null,
    });

    expect(result).toBe(true);
  });

  it("keeps the material/kit option hidden for campaigns without needs outside the special case", () => {
    const result = shouldShowMaterialContributionOption({
      campaignTitle: "Reforma da Escola",
      campaignNeeds: [],
      currentType: null,
      initialType: null,
    });

    expect(result).toBe(false);
  });

  it("uses the mountain-kit copy for the Legendário campaign", () => {
    const copy = getMaterialContributionCopy("Legendario Solidario");

    expect(copy.label).toBe("Kit/Itens");
    expect(copy.subtitle.toLowerCase()).toContain("mochila");
    expect(copy.description.toLowerCase()).toContain("kit");
  });
});
