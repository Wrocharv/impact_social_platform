import { describe, expect, it } from "vitest";
import { mergeNeedsForManagement } from "./localNeeds";

describe("mergeNeedsForManagement", () => {
  it("preserva os itens vindos do servidor e junta os itens locais sem perder a meta", () => {
    const serverNeeds = [
      {
        id: 11,
        campaignId: 100,
        type: "material" as const,
        name: "Tijolo",
        quantity: "3.700 unidades",
        targetQuantityExact: 3700,
        unitValueCents: 180,
        priority: "high" as const,
        description: "Para a estrutura",
      },
    ];

    const localNeeds = [
      {
        id: 12,
        campaignId: 100,
        type: "material" as const,
        name: "Cimento",
        quantity: "20 sacos",
        targetQuantityExact: 20,
        unitValueCents: 4500,
        priority: "medium" as const,
        description: "Para acabamento",
      },
    ];

    const result = mergeNeedsForManagement(serverNeeds, localNeeds);

    expect(result).toHaveLength(2);
    expect(result.find((need) => need.id === 11)?.targetQuantityExact).toBe(3700);
    expect(result.find((need) => need.id === 12)?.name).toBe("Cimento");
  });

  it("prioriza a versão local quando o item já existe no servidor e foi editado localmente", () => {
    const serverNeeds = [
      {
        id: 11,
        campaignId: 100,
        type: "material" as const,
        name: "Tijolo",
        quantity: "3.700 unidades",
        targetQuantityExact: 3700,
        unitValueCents: 180,
        priority: "high" as const,
        description: "Para a estrutura",
      },
    ];

    const localNeeds = [
      {
        id: 11,
        campaignId: 100,
        type: "material" as const,
        name: "Tijolo editado",
        quantity: "500 unidades",
        targetQuantityExact: 500,
        unitValueCents: 250,
        priority: "medium" as const,
        description: "Atualização local",
      },
    ];

    const result = mergeNeedsForManagement(serverNeeds, localNeeds);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Tijolo editado");
    expect(result[0]?.quantity).toBe("500 unidades");
    expect(result[0]?.targetQuantityExact).toBe(500);
  });
});
