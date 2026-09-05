/**
 * Códigos de acesso à área do doador.
 *
 * O site inteiro é aberto: ninguém precisa de conta pra doar, nem pra ver o
 * mural de doadores de uma campanha. O código só entra em cena no único ponto
 * em que aparecem valores — quando a pessoa pede pra ver o histórico dela.
 *
 * Guardamos em memória de propósito: o código vive 10 minutos, então não vale
 * uma tabela e uma migration. Se o servidor reiniciar no meio, a pessoa pede
 * outro código — custo pequeno perto de carregar esquema novo.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_INTERVAL_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export const DONOR_CODE_TTL_MINUTES = CODE_TTL_MS / 60_000;

type StoredCode = {
  code: string;
  email: string;
  expiresAt: number;
  createdAt: number;
  attemptsLeft: number;
};

const codes = new Map<string, StoredCode>();

function purgeExpired(now: number) {
  for (const [key, entry] of Array.from(codes.entries())) {
    if (entry.expiresAt <= now) codes.delete(key);
  }
}

/** 6 dígitos legíveis por telefone. Random simples basta: o código expira em 10 min e só aceita 5 tentativas. */
export function generateAccessCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function canSendCode(identityKey: string, now = Date.now()) {
  const existing = codes.get(identityKey);
  if (!existing) return true;
  return now - existing.createdAt >= RESEND_INTERVAL_MS;
}

export function storeAccessCode(
  identityKey: string,
  code: string,
  email: string,
  now = Date.now(),
) {
  purgeExpired(now);
  codes.set(identityKey, {
    code,
    email,
    createdAt: now,
    expiresAt: now + CODE_TTL_MS,
    attemptsLeft: MAX_ATTEMPTS,
  });
}

export type CodeCheckResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "mismatch" };

export function consumeAccessCode(
  identityKey: string,
  code: string,
  now = Date.now(),
): CodeCheckResult {
  // Le antes de varrer: quem chegou com o codigo vencido merece ouvir
  // "expirou, peca outro", nao um generico "nao vale mais".
  const entry = codes.get(identityKey);
  purgeExpired(now);
  if (!entry) return { ok: false, reason: "not_found" };
  if (entry.expiresAt <= now) {
    codes.delete(identityKey);
    return { ok: false, reason: "expired" };
  }
  if (entry.attemptsLeft <= 0) {
    codes.delete(identityKey);
    return { ok: false, reason: "too_many_attempts" };
  }

  if (entry.code !== code.trim()) {
    entry.attemptsLeft -= 1;
    if (entry.attemptsLeft <= 0) {
      codes.delete(identityKey);
      return { ok: false, reason: "too_many_attempts" };
    }
    return { ok: false, reason: "mismatch" };
  }

  // Código de uso único: acertou, queima.
  codes.delete(identityKey);
  return { ok: true };
}

/** j***@gmail.com — confirma pra pessoa qual caixa olhar sem expor o endereço inteiro. */
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "seu e-mail";
  const visible = user.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(user.length - 1, 1))}@${domain}`;
}

/** Só pra testes: zera o cofre entre casos. */
export function __clearAccessCodes() {
  codes.clear();
}
