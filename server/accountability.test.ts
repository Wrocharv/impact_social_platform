import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { getDbMock, storagePutMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  storagePutMock: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: getDbMock }));
vi.mock("./storage", () => ({ storagePut: storagePutMock }));

import { decodeTransparencyUpload, summarizeExpenses } from "./accountability";
import { appRouter } from "./routers";

function createContext(role?: "admin" | "user"): TrpcContext {
  return {
    user: role
      ? ({ id: 7, openId: "user-7", name: "Responsável", email: "responsavel@example.org", role } as TrpcContext["user"])
      : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const campaign = {
  id: 4,
  title: "Reforma comunitária",
  description: "Descrição",
  longDescription: null,
  goal: 100_000,
  raised: 0,
  status: "active" as const,
  imageUrl: null,
  createdBy: 7,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  startDate: null,
  endDate: null,
};

function createCampaignLookup() {
  return {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({ limit: vi.fn().mockResolvedValue([campaign]) }),
      }),
    })),
  };
}

describe("accountability", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    storagePutMock.mockReset();
  });

  it("resume despesas por categoria sem inventar valores", () => {
    expect(summarizeExpenses([
      { category: "materials", amount: 12_000 },
      { category: "labor", amount: 8_000 },
      { category: "materials", amount: 3_000 },
    ])).toEqual({
      totalSpent: 23_000,
      byCategory: [
        { category: "materials", amount: 15_000 },
        { category: "labor", amount: 8_000 },
      ],
    });
  });

  it("rejeita conteúdo que não corresponde ao MIME informado", () => {
    const bytes = Buffer.from("não é um PDF");
    expect(() => decodeTransparencyUpload({
      name: "recibo.pdf",
      mimeType: "application/pdf",
      size: bytes.length,
      base64: bytes.toString("base64"),
    })).toThrow("conteúdo não corresponde");
  });

  it("rejeita base64 inválido antes de tentar o armazenamento", () => {
    expect(() => decodeTransparencyUpload({
      name: "recibo.pdf",
      mimeType: "application/pdf",
      size: 3,
      base64: "***",
    })).toThrow("formato inválido");
  });

  it("rejeita arquivos acima de 5 MB no contrato da API", async () => {
    const caller = appRouter.createCaller(createContext("admin"));

    await expect(caller.accountability.uploadDocument({
      campaignId: 4,
      type: "receipt",
      title: "Recibo",
      file: {
        name: "recibo.pdf",
        mimeType: "application/pdf",
        size: 5 * 1024 * 1024 + 1,
        base64: Buffer.from("%PDF-1.4\n").toString("base64"),
      },
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storagePutMock).not.toHaveBeenCalled();
  });

  it("bloqueia upload para usuário sem papel administrativo", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    const bytes = Buffer.from("%PDF-1.4\n");

    await expect(caller.accountability.uploadDocument({
      campaignId: 4,
      type: "receipt",
      title: "Recibo",
      file: {
        name: "recibo.pdf",
        mimeType: "application/pdf",
        size: bytes.length,
        base64: bytes.toString("base64"),
      },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storagePutMock).not.toHaveBeenCalled();
  });

  it("exige papel administrativo para consultar o relatório interno", async () => {
    const caller = appRouter.createCaller(createContext("user"));

    await expect(caller.accountability.getAdminReport({ campaignId: 4 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("não expõe relatório público de campanha fora dos status publicados", async () => {
    getDbMock.mockResolvedValue({
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      })),
    });
    const caller = appRouter.createCaller(createContext());

    await expect(caller.accountability.getPublicReport({ campaignId: 4 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("valida, armazena no S3 e persiste somente metadados", async () => {
    const values = vi.fn().mockResolvedValue({});
    const db = { ...createCampaignLookup(), insert: vi.fn(() => ({ values })) };
    getDbMock.mockResolvedValue(db);
    storagePutMock.mockResolvedValue({ key: "campaigns/4/transparency/recibo.pdf", url: "/manus-storage/campaigns/4/transparency/recibo.pdf" });
    const caller = appRouter.createCaller(createContext("admin"));
    const bytes = Buffer.from("%PDF-1.4\nconteudo");

    await caller.accountability.uploadDocument({
      campaignId: 4,
      type: "receipt",
      title: "Recibo do material",
      description: "Compra aprovada",
      file: {
        name: "recibo.pdf",
        mimeType: "application/pdf",
        size: bytes.length,
        base64: bytes.toString("base64"),
      },
    });

    expect(storagePutMock).toHaveBeenCalledWith(
      expect.stringContaining("campaigns/4/transparency/"),
      bytes,
      "application/pdf",
    );
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 4,
      documentUrl: "/manus-storage/campaigns/4/transparency/recibo.pdf",
      storageKey: "campaigns/4/transparency/recibo.pdf",
      fileName: "recibo.pdf",
      fileSize: bytes.length,
      createdBy: 7,
    }));
    expect(values.mock.calls[0][0]).not.toHaveProperty("base64");
  });

  it("registra despesa em centavos e UTC", async () => {
    const values = vi.fn().mockResolvedValue({});
    const db = { ...createCampaignLookup(), insert: vi.fn(() => ({ values })) };
    getDbMock.mockResolvedValue(db);
    const caller = appRouter.createCaller(createContext("admin"));

    await caller.accountability.createExpense({
      campaignId: 4,
      category: "materials",
      title: "Compra de cimento",
      amount: 25_990,
      expenseDate: Date.parse("2026-01-15T12:00:00.000Z"),
    });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 4,
      category: "materials",
      amount: 25_990,
      expenseDate: new Date("2026-01-15T12:00:00.000Z"),
      createdBy: 7,
    }));
  });

  it("rejeita data de despesa futura", async () => {
    const caller = appRouter.createCaller(createContext("admin"));

    await expect(caller.accountability.createExpense({
      campaignId: 4,
      category: "materials",
      title: "Compra futura",
      amount: 1_000,
      expenseDate: Date.now() + 2 * 86_400_000,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("rejeita comprovante que não pertence à campanha", async () => {
    let selectCall = 0;
    const insert = vi.fn();
    getDbMock.mockResolvedValue({
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockImplementation(() => {
              selectCall += 1;
              return Promise.resolve(selectCall === 1 ? [campaign] : []);
            }),
          }),
        }),
      })),
      insert,
    });
    const caller = appRouter.createCaller(createContext("admin"));

    await expect(caller.accountability.createExpense({
      campaignId: 4,
      category: "materials",
      title: "Compra com comprovante incorreto",
      amount: 5_000,
      expenseDate: Date.parse("2026-01-15T12:00:00.000Z"),
      documentId: 999,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(insert).not.toHaveBeenCalled();
  });
});
