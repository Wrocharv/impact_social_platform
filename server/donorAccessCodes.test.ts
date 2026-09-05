import { beforeEach, describe, expect, it } from "vitest";
import {
  __clearAccessCodes,
  canSendCode,
  consumeAccessCode,
  generateAccessCode,
  maskEmail,
  storeAccessCode,
} from "./donorAccessCodes";

const KEY = "cpf:12345678901";
const EMAIL = "maria@example.com";
const MINUTE = 60_000;

describe("códigos de acesso do doador", () => {
  beforeEach(() => __clearAccessCodes());

  it("abre o histórico com o código certo", () => {
    storeAccessCode(KEY, "123456", EMAIL);
    expect(consumeAccessCode(KEY, "123456")).toEqual({ ok: true });
  });

  it("recusa o código errado", () => {
    storeAccessCode(KEY, "123456", EMAIL);
    expect(consumeAccessCode(KEY, "999999")).toEqual({ ok: false, reason: "mismatch" });
  });

  it("queima o código depois de usado, pra ele não valer duas vezes", () => {
    storeAccessCode(KEY, "123456", EMAIL);
    consumeAccessCode(KEY, "123456");
    expect(consumeAccessCode(KEY, "123456")).toEqual({ ok: false, reason: "not_found" });
  });

  it("bloqueia depois de 5 tentativas erradas, pra ninguém varrer os 6 dígitos", () => {
    storeAccessCode(KEY, "123456", EMAIL);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(consumeAccessCode(KEY, "000000")).toEqual({ ok: false, reason: "mismatch" });
    }
    expect(consumeAccessCode(KEY, "000000")).toEqual({ ok: false, reason: "too_many_attempts" });
    // Nem o código certo passa depois disso: tem que pedir outro.
    expect(consumeAccessCode(KEY, "123456")).toEqual({ ok: false, reason: "not_found" });
  });

  it("expira em 10 minutos", () => {
    const now = Date.now();
    storeAccessCode(KEY, "123456", EMAIL, now);
    expect(consumeAccessCode(KEY, "123456", now + 9 * MINUTE)).toEqual({ ok: true });

    storeAccessCode(KEY, "123456", EMAIL, now);
    expect(consumeAccessCode(KEY, "123456", now + 11 * MINUTE)).toEqual({ ok: false, reason: "expired" });
  });

  it("não deixa pedir dois códigos no mesmo minuto", () => {
    const now = Date.now();
    expect(canSendCode(KEY, now)).toBe(true);
    storeAccessCode(KEY, "123456", EMAIL, now);
    expect(canSendCode(KEY, now + 30_000)).toBe(false);
    expect(canSendCode(KEY, now + 61_000)).toBe(true);
  });

  it("cada identidade tem seu próprio código", () => {
    storeAccessCode("cpf:11111111111", "111111", EMAIL);
    storeAccessCode("cpf:22222222222", "222222", EMAIL);
    expect(consumeAccessCode("cpf:11111111111", "222222")).toEqual({ ok: false, reason: "mismatch" });
    expect(consumeAccessCode("cpf:22222222222", "222222")).toEqual({ ok: true });
  });

  it("gera sempre 6 dígitos", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateAccessCode()).toMatch(/^\d{6}$/);
    }
  });

  it("mascara o e-mail sem esconder de qual caixa se trata", () => {
    expect(maskEmail("maria@example.com")).toBe("m****@example.com");
    expect(maskEmail("sem-arroba")).toBe("seu e-mail");
  });
});
