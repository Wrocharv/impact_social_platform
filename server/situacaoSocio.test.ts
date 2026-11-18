import { describe, expect, it } from "vitest";
import { situacaoDoSocio } from "./monthlyPledges";

// Cadastro em 18/11/2026 (meio-dia em Brasilia), parcelas todo dia 10 a partir de dezembro.
const base = {
  id: 1,
  campaignId: 0,
  quickCampaignId: 3,
  fullName: "Maria",
  cpf: "",
  email: null,
  whatsapp: "64999990000",
  city: null,
  installmentsPaid: 0,
  reminderDay: 10,
  status: "active" as const,
  lastReminderAt: null,
  createdAt: new Date("2026-11-18T15:00:00Z"),
};

const parcelado = { ...base, totalAmountCents: 30000, installments: 10, installmentAmountCents: 3000, downPaymentCents: 0 };
const comEntrada = { ...base, totalAmountCents: 30000, installments: 10, installmentAmountCents: 2000, downPaymentCents: 10000 };
const aVista = { ...base, totalAmountCents: 30000, installments: 0, installmentAmountCents: 0, downPaymentCents: 30000 };

describe("situacaoDoSocio", () => {
  it("sem entrada, continua como antes", () => {
    const s = situacaoDoSocio(parcelado, 0, "2026-11-20");
    expect(s.categoria).toBe("em_dia");
    expect(s.primeiraEmAberto).toBe("2026-12-10");
    const depois = situacaoDoSocio(parcelado, 3000, "2027-01-11");
    expect(depois.parcelasPagas).toBe(1);
    expect(depois.atrasadas).toBe(1);
    expect(depois.valorAtrasadoCents).toBe(3000);
    expect(situacaoDoSocio(parcelado, 30000, "2027-01-11").categoria).toBe("concluido");
  });

  it("entrada nao paga: primeiro 'vence logo', depois de 3 dias vira atrasada", () => {
    const logo = situacaoDoSocio(comEntrada, 0, "2026-11-20");
    expect(logo.categoria).toBe("vence_logo");
    expect(logo.entradaEmAbertoCents).toBe(10000);
    const s = situacaoDoSocio(comEntrada, 0, "2026-11-22");
    expect(s.categoria).toBe("atrasado");
    expect(s.entradaPaga).toBe(false);
    expect(s.valorAtrasadoCents).toBe(10000);
    expect(s.primeiraEmAberto).toBe("2026-11-18");
  });

  it("o que entra paga primeiro a entrada, depois as parcelas", () => {
    const soEntrada = situacaoDoSocio(comEntrada, 10000, "2026-11-20");
    expect(soEntrada.entradaPaga).toBe(true);
    expect(soEntrada.parcelasPagas).toBe(0);
    expect(soEntrada.categoria).toBe("em_dia");
    const umaParcela = situacaoDoSocio(comEntrada, 12000, "2026-12-11");
    expect(umaParcela.parcelasPagas).toBe(1);
    expect(umaParcela.categoria).toBe("em_dia");
    expect(situacaoDoSocio(comEntrada, 30000, "2026-12-11").categoria).toBe("concluido");
  });

  it("a vista: quita com um pagamento so", () => {
    expect(situacaoDoSocio(aVista, 0, "2026-11-18").categoria).toBe("vence_logo");
    expect(situacaoDoSocio(aVista, 30000, "2026-11-18").categoria).toBe("concluido");
  });
});
