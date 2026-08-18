#!/usr/bin/env node
// Diagnóstico SOMENTE LEITURA: mostra quais colunas esperadas pelo schema
// já existem (ou não) nas tabelas de produção. Não altera nada no banco.
import mysql from "mysql2/promise";
import readline from "node:readline/promises";

const expected = {
  campaigns: ["vipApartmentAmountCents", "category", "longDescription", "imageUrl"],
  contributions: [
    "donorWhatsapp",
    "donorCity",
    "donorChurch",
    "deliveryMethod",
    "numberOfInstallments",
    "installmentFrequency",
    "materialDeliveryFrequency",
    "allowPublicDisplay",
    "validatedBy",
    "validatedAt",
    "validationNote",
    "campaignNeedId",
    "quantityExact",
    "estimatedAmount",
    "donorCpf",
    "donorBirthDate",
    "donorGender",
  ],
  partners: ["ownerName", "storePhotoUrl", "ownerPhotoUrl", "address", "contactInfo", "testimonialVideoUrl", "testimonialText"],
  campaignNeeds: ["targetQuantityExact", "unitValueCents"],
};

async function main() {
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    databaseUrl = await rl.question("Cole a DATABASE_URL de produção: ");
    rl.close();
  }

  const conn = await mysql.createConnection(databaseUrl);

  console.log("\n=== __drizzle_migrations aplicadas ===");
  try {
    const [rows] = await conn.query(
      "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at ASC"
    );
    console.table(rows);
  } catch (err) {
    console.log("(tabela __drizzle_migrations não existe ou erro ao ler):", err.message);
  }

  for (const [table, columns] of Object.entries(expected)) {
    console.log(`\n=== ${table} ===`);
    const [rows] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    const existing = new Set(rows.map((r) => r.Field));
    for (const col of columns) {
      console.log(`  ${existing.has(col) ? "OK  " : "FALTA"} ${col}`);
    }
  }

  await conn.end();
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
