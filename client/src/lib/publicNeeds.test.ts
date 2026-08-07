import { describe, expect, it } from "vitest";
import { buildPublicNeedsList } from "./publicNeeds";

describe("buildPublicNeedsList", () => {
  it("usa apenas as necessidades vindas do servidor e não injeta itens extras", () => {
    const serverNeeds = [
      {
        id: 1,
        name: "Cimento",
        quantity: "10 sacos",
        priority: "high" as const,
        targetQuantityExact: 10,
        unitValueCents: 5_000,
      },
      {
        id: 2,
        name: "Tijolo",
        quantity: "1000 unidades",
        priority: "medium" as const,
        targetQuantityExact: 1000,
        unitValueCents: 120,
      },
    ];

    const progress = new Map([[1, { campaignId: 100001, needId: 1, offeredQuantity: 2, offeredValueCents: 10_000 }]]);

    const result = buildPublicNeedsList(serverNeeds as any, progress);

    expect(result.map((need) => need.id)).toEqual([1, 2]);
    expect(result.find((need) => need.id === 1)).toMatchObject({
      offeredQuantity: 2,
      remainingQuantity: 8,
    });
  });

  it("inclui as necessidades locais do admin quando o ambiente é localhost", () => {
    const serverNeeds = [{ id: 1, name: "Cimento", quantity: "10 sacos", priority: "high" as const, targetQuantityExact: 10, unitValueCents: 5_000 }];
    const localNeeds = [{ id: 2, name: "Tijolo", quantity: "1000 unidades", priority: "medium" as const, targetQuantityExact: 1000, unitValueCents: 120 }];

    const result = buildPublicNeedsList(serverNeeds as any, new Map(), localNeeds as any);

    expect(result.map((need) => need.id)).toEqual([1, 2]);
    expect(result.find((need) => need.id === 2)).toMatchObject({ name: "Tijolo", remainingQuantity: 1000 });
  });

  it("usa a lista local como fonte de verdade e preserva o progresso do item correspondente", () => {
    const serverNeeds = [
      {
        id: 10,
        name: "Cimento",
        quantity: "10 sacos",
        priority: "high" as const,
        targetQuantityExact: 10,
        unitValueCents: 5_000,
        offeredQuantity: 2,
        offeredValueCents: 10_000,
        remainingQuantity: 8,
      },
    ];
    const localNeeds = [
      {
        id: 99,
        name: "Cimento",
        quantity: "12 sacos",
        priority: "high" as const,
        targetQuantityExact: 12,
        unitValueCents: 6_000,
      },
    ];
    const progress = new Map([[10, { campaignId: 100001, needId: 10, offeredQuantity: 1, offeredValueCents: 6_000 }]]);

    const result = buildPublicNeedsList(serverNeeds as any, progress, localNeeds as any);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 99, name: "Cimento", targetQuantityExact: 12, unitValueCents: 6000, offeredQuantity: 3, remainingQuantity: 9 });
  });
});
