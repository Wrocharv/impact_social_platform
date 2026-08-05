import { readFileSync } from "node:fs";
import path from "node:path";

const FALLBACK_FILE = path.resolve(process.cwd(), "server", ".whatsapp-fallback-campaigns.json");

function fail(message) {
  console.error(`[campaign-policy] ${message}`);
  process.exit(1);
}

function normalize(value) {
  return typeof value === "string"
    ? value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
    : "";
}

const campaigns = JSON.parse(readFileSync(FALLBACK_FILE, "utf8"));

if (!Array.isArray(campaigns)) {
  fail("Fallback de campanhas invalido: formato esperado e lista.");
}

const hotel = campaigns.find((campaign) => Number(campaign?.id) === 100001);
const legendario = campaigns.find((campaign) => Number(campaign?.id) === 100002);

if (!hotel) fail("Campanha 100001 (Hotel Recanto) nao encontrada.");
if (!legendario) fail("Campanha 100002 (Legendario) nao encontrada.");

if (!normalize(hotel.title).includes("hotel recanto de paz")) {
  fail("Campanha 100001 com titulo incorreto para Hotel Recanto.");
}

if (!normalize(legendario.title).includes("legendario")) {
  fail("Campanha 100002 com titulo incorreto para Legendario.");
}

if (Number(hotel.goal) <= 0) {
  fail("Campanha 100001 esta sem meta valida.");
}

if (Number(legendario.goal) <= 100_000) {
  fail("Campanha 100002 com meta invalida (nao pode ser 100.000 ou menor).");
}

if (Number(hotel.vipApartmentAmountCents) <= 0) {
  fail("Campanha 100001 esta sem valor VIP valido.");
}

if (!Array.isArray(hotel.needs) || hotel.needs.length < 3) {
  fail("Campanha 100001 perdeu itens de materiais criticos (minimo 3 itens).");
}

console.log("[campaign-policy] OK: meta, VIP e itens criticos validados.");
