import "dotenv/config";
import { and, eq, or } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb } from "./db";

function parseArgs() {
  const args = process.argv.slice(2);
  const emailArg = args.find((arg) => arg.startsWith("--email="));
  const openIdArg = args.find((arg) => arg.startsWith("--openId="));

  const email = emailArg?.split("=")[1]?.trim();
  const openId = openIdArg?.split("=")[1]?.trim();

  if (!email && !openId) {
    throw new Error("Use --email=<email> ou --openId=<openId>");
  }

  return { email, openId };
}

async function main() {
  const { email, openId } = parseArgs();
  const db = await getDb();

  if (!db) {
    throw new Error("Banco indisponível. Verifique DATABASE_URL no ambiente.");
  }

  const whereClause = and(
    email ? eq(users.email, email) : undefined,
    openId ? eq(users.openId, openId) : undefined,
  );

  // If both email and openId are provided, both must match the same user.
  const lookupCondition = whereClause ?? or(email ? eq(users.email, email) : undefined, openId ? eq(users.openId, openId) : undefined);
  if (!lookupCondition) {
    throw new Error("Nenhum critério de busca foi informado.");
  }

  const found = await db
    .select({ id: users.id, openId: users.openId, email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(lookupCondition)
    .limit(10);

  if (found.length === 0) {
    throw new Error("Usuário não encontrado. Faça login no site primeiro para criar o usuário na tabela users.");
  }

  const target = found[0];

  await db
    .update(users)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(users.id, target.id));

  console.log("Admin concedido com sucesso:");
  console.log(JSON.stringify({ id: target.id, openId: target.openId, email: target.email, name: target.name, role: "admin" }, null, 2));
}

main().catch((error) => {
  console.error("[grant-admin] Erro:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
