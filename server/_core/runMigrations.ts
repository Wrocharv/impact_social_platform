import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Connection } from "mysql2/promise";

type JournalEntry = { idx: number; tag: string; when: number };

/**
 * Códigos de erro do MySQL que significam "essa mudança já foi aplicada antes"
 * (coluna/índice/tabela duplicados) — tratados como sucesso, não como falha.
 */
const ALREADY_APPLIED_ERROR_CODES = new Set([
  "ER_DUP_FIELDNAME",
  "ER_DUP_KEYNAME",
  "ER_TABLE_EXISTS_ERROR",
]);

function isAlreadyAppliedError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && ALREADY_APPLIED_ERROR_CODES.has(code);
}

/**
 * Aplica as migrações do journal statement por statement, em vez de tudo numa
 * transação só. Assim, se uma coluna já existir (aplicada manualmente antes,
 * fora do controle do drizzle), só aquele statement é pulado — as demais
 * migrações do lote continuam normalmente, em vez de o lote inteiro abortar.
 */
export async function runMigrationsResiliently(conn: Connection, migrationsFolder: string): Promise<void> {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  const [rows] = (await conn.query(
    "SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1"
  )) as unknown as [Array<{ created_at: string | number }>, unknown];
  const lastAppliedAt = rows[0] ? Number(rows[0].created_at) : 0;

  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: JournalEntry[] };

  for (const entry of journal.entries) {
    if (entry.when <= lastAppliedAt) continue;

    const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const content = fs.readFileSync(sqlPath, "utf8");
    const statements = content
      .split("--> statement-breakpoint")
      .map(s => s.trim())
      .filter(Boolean);

    let allStatementsOk = true;
    for (const statement of statements) {
      try {
        await conn.query(statement);
      } catch (error) {
        if (isAlreadyAppliedError(error)) {
          console.warn(`[Database] Migração ${entry.tag}: já aplicada antes, pulando statement.`);
          continue;
        }
        allStatementsOk = false;
        console.error(`[Database] Migração ${entry.tag} falhou num statement:`, error);
      }
    }

    if (allStatementsOk) {
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      await conn.query("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", [hash, entry.when]);
      console.log(`[Database] Migração ${entry.tag} aplicada.`);
    } else {
      console.warn(`[Database] Migração ${entry.tag} não foi totalmente aplicada; será retentada no próximo start.`);
    }
  }
}
