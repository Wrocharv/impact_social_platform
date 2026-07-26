import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { getDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: getDbMock,
}));

import { appRouter } from "./routers";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("contributions.createMaterialContribution", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("inclui a necessidade e a quantidade na descrição da oferta de material", async () => {
    const insertValues = vi.fn().mockResolvedValue({});
    const selectResults = [
      [{ id: 7 }],
      [{ id: 11, name: "Cimento" }],
    ];

    getDbMock.mockResolvedValue({
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockImplementation(async () => selectResults.shift() ?? []),
          }),
        }),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
    });

    const caller = appRouter.createCaller(createPublicContext());

    await caller.contributions.createMaterialContribution({
      campaignId: 7,
      description: "Quero doar cimento para a obra.",
      donorEmail: "doa@example.org",
      campaignNeedId: 11,
      quantity: "20 sacos",
    });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 7,
      donorEmail: "doa@example.org",
      type: "material",
      description: expect.stringContaining("Necessidade: Cimento"),
    }));
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining("Quantidade: 20 sacos"),
    }));
  });
});
