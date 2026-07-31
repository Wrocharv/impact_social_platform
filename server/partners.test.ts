import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { getDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: getDbMock,
}));

import { appRouter } from "./routers";

function createContext(role?: "admin" | "user"): TrpcContext {
  return {
    user: role
      ? ({
          id: 1,
          openId: "user-1",
          name: "Responsável",
          email: "responsavel@example.org",
          role,
        } as TrpcContext["user"])
      : null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const rows = [
  {
    id: 3,
    name: "Construtora Solidária",
    type: "company" as const,
    ownerName: "João Silva",
    description: "Doação de materiais",
    logoUrl: "https://example.org/logo.png",
    storePhotoUrl: "https://example.org/loja.png",
    ownerPhotoUrl: "https://example.org/dono.png",
    address: "Rua das Flores, 123 - Centro",
    contactInfo: "(11) 99999-9999",
    website: "https://example.org",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

function createListDb() {
  return {
    select: vi.fn(() => ({
      from: () => ({
        orderBy: vi.fn().mockResolvedValue(rows),
      }),
    })),
  };
}

describe("partners router", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("permite listar parceiros persistidos sem autenticação", async () => {
    getDbMock.mockResolvedValue(createListDb());
    const caller = appRouter.createCaller(createContext());

    await expect(caller.partners.listPublished()).resolves.toEqual(expect.arrayContaining(rows));
  });

  it("permite o cadastro para o usuário local autorizado", async () => {
    const values = vi.fn().mockResolvedValue({});
    getDbMock.mockResolvedValue({ insert: vi.fn(() => ({ values })) });
    const caller = appRouter.createCaller({
      ...createContext("user"),
      user: {
        ...(createContext("user").user as NonNullable<ReturnType<typeof createContext>['user']>),
        email: "gospeltv@gmail.com",
      },
    });

    await expect(caller.partners.create({
      name: "Construtora Solidária",
      type: "company",
    })).resolves.toMatchObject({ success: true });
  });

  it("bloqueia o cadastro para usuários sem papel administrativo", async () => {
    const caller = appRouter.createCaller(createContext("user"));

    await expect(caller.partners.create({
      name: "Construtora Solidária",
      type: "company",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("normaliza campos vazios e cadastra parceiro como administrador", async () => {
    const values = vi.fn().mockResolvedValue({});
    getDbMock.mockResolvedValue({ insert: vi.fn(() => ({ values })) });
    const caller = appRouter.createCaller(createContext("admin"));

    const result = await caller.partners.create({
      name: "  Construtora Solidária  ",
      type: "company",
      description: "",
      logoUrl: "",
      ownerName: "",
      storePhotoUrl: "",
      ownerPhotoUrl: "",
      address: "",
      contactInfo: "",
      website: "",
    });

    expect(values).toHaveBeenCalledWith({
      name: "Construtora Solidária",
      type: "company",
      ownerName: undefined,
      description: undefined,
      logoUrl: undefined,
      storePhotoUrl: undefined,
      ownerPhotoUrl: undefined,
      address: undefined,
      contactInfo: undefined,
      website: undefined,
    });
    expect(result.success).toBe(true);
  });

  it("edita um parceiro e registra a atualização", async () => {
    const where = vi.fn().mockResolvedValue({});
    const set = vi.fn(() => ({ where }));
    getDbMock.mockResolvedValue({ update: vi.fn(() => ({ set })) });
    const caller = appRouter.createCaller(createContext("admin"));

    await caller.partners.update({
      id: 3,
      name: "Parceiro Atualizado",
      website: "https://parceiro.example.org",
    });

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      name: "Parceiro Atualizado",
      website: "https://parceiro.example.org",
      updatedAt: expect.any(Date),
    }));
    expect(where).toHaveBeenCalled();
  });

  it("usa armazenamento local quando o banco não está configurado", async () => {
    getDbMock.mockResolvedValue(null);
    const caller = appRouter.createCaller(createContext("admin"));

    await expect(caller.partners.create({
      name: "Parceria local",
      type: "company",
      description: "Teste local",
    })).resolves.toMatchObject({ success: true });

    const partners = await caller.partners.getAll();
    // The fallback store may contain entries from other tests or prior runs;
    // verify the newly created partner is present in the list.
    expect(partners).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Parceria local", type: "company" }),
    ]));
  });

  it("faz fallback para insercao legada quando o insert completo falha", async () => {
    const values = vi.fn()
      .mockRejectedValueOnce(new Error("Unknown column 'ownerName'"))
      .mockResolvedValueOnce({});
    getDbMock.mockResolvedValue({ insert: vi.fn(() => ({ values })) });
    const caller = appRouter.createCaller(createContext("admin"));

    await expect(caller.partners.create({
      name: "Múltipla Escolha",
      type: "company",
      ownerName: "Lucas Daniel Sardinha",
      description: "Pedras que transformam ambientes",
      contactInfo: "(64) 3621-201",
      website: "https://example.org",
    })).resolves.toMatchObject({ success: true });

    expect(values).toHaveBeenCalledTimes(2);
    expect(values).toHaveBeenNthCalledWith(2, {
      name: "Múltipla Escolha",
      type: "company",
      description: "Pedras que transformam ambientes",
      logoUrl: undefined,
      website: "https://example.org",
    });
  });

  it("remove um parceiro como administrador", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: 3 }]);
    const whereSelect = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where: whereSelect }));
    const select = vi.fn(() => ({ from }));
    const where = vi.fn().mockResolvedValue({});
    getDbMock.mockResolvedValue({
      select,
      delete: vi.fn(() => ({ where })),
    });
    const caller = appRouter.createCaller(createContext("admin"));

    await expect(caller.partners.delete({ id: 3 })).resolves.toMatchObject({ success: true });
    expect(where).toHaveBeenCalled();
  });

  it("retorna NOT_FOUND quando parceiro nao existe na exclusao", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const whereSelect = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where: whereSelect }));
    const select = vi.fn(() => ({ from }));
    const where = vi.fn();
    getDbMock.mockResolvedValue({
      select,
      delete: vi.fn(() => ({ where })),
    });
    const caller = appRouter.createCaller(createContext("admin"));

    await expect(caller.partners.delete({ id: 9999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(where).not.toHaveBeenCalled();
  });

  it("remove parceiro pelo fallback quando o banco falha na exclusao", async () => {
    getDbMock.mockResolvedValue(null);
    const seedCaller = appRouter.createCaller(createContext("admin"));
    const uniqueName = `Parceiro fallback ${Date.now()}`;
    await expect(seedCaller.partners.create({
      name: uniqueName,
      type: "company",
      description: "Seed para teste de exclusao via fallback",
    })).resolves.toMatchObject({ success: true });

    const seededPartners = await seedCaller.partners.getAll();
    const seededPartner = seededPartners.find((partner) => partner.name === uniqueName);
    expect(seededPartner).toBeTruthy();
    if (!seededPartner) {
      throw new Error("Partner seed not found");
    }

    const limit = vi.fn().mockResolvedValue([{ id: seededPartner.id }]);
    const whereSelect = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where: whereSelect }));
    const select = vi.fn(() => ({ from }));
    const where = vi.fn().mockRejectedValue(new Error("db unavailable"));
    const caller = appRouter.createCaller(createContext("admin"));

    getDbMock.mockResolvedValue({
      select,
      delete: vi.fn(() => ({ where })),
    });

    await expect(caller.partners.delete({ id: seededPartner.id })).resolves.toMatchObject({ success: true });
  });
});
