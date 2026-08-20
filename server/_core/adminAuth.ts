import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import { parse as parseCookieHeader } from "cookie";
import { adminUsers, type AdminUser } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";

export const ADMIN_COOKIE_NAME = "pdb_admin_session";
const ADMIN_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export const ADMIN_SECTIONS = ["campaigns", "content", "validations", "partners", "community", "comments"] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export type AdminRole = "owner" | "full" | "partial";

export type AdminSessionPayload = {
  id: number;
  email: string;
  name: string | null;
  role: AdminRole;
  allowedSections: AdminSection[];
};

function getSecretKey() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function parseAllowedSections(value: string | null): AdminSection[] {
  if (!value) return [];
  return value
    .split(",")
    .map(s => s.trim())
    .filter((s): s is AdminSection => (ADMIN_SECTIONS as readonly string[]).includes(s));
}

function toSessionPayload(admin: AdminUser): AdminSessionPayload {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role as AdminRole,
    allowedSections: parseAllowedSections(admin.allowedSections),
  };
}

export function hasSection(session: AdminSessionPayload | null | undefined, section: AdminSection): boolean {
  if (!session) return false;
  if (session.role === "owner" || session.role === "full") return true;
  return session.allowedSections.includes(section);
}

// O token só carrega o id — todo o resto (papel, permissões) é lido do banco a
// cada requisição, para que remover ou rebaixar um administrador tenha efeito
// imediato, sem esperar o token expirar em até 30 dias.
export async function createAdminSessionToken(admin: AdminUser): Promise<string> {
  return new SignJWT({ id: admin.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + ADMIN_SESSION_MS) / 1000))
    .sign(getSecretKey());
}

async function getAdminIdFromToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return typeof payload.id === "number" ? payload.id : null;
  } catch {
    return null;
  }
}

export async function getAdminSessionFromRequest(req: Request): Promise<AdminSessionPayload | null> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!token) return null;

  const id = await getAdminIdFromToken(token);
  if (!id) return null;

  const admin = await getAdminUserById(id);
  if (!admin) return null;

  return toSessionPayload(admin);
}

export function getAdminSessionCookieOptions(req: Request) {
  return { ...getSessionCookieOptions(req), maxAge: ADMIN_SESSION_MS };
}

export async function getAdminUserByEmail(email: string): Promise<AdminUser | null> {
  const db = await getDb();
  if (!db) return null;
  const normalized = email.trim().toLowerCase();
  const rows = await db.select().from(adminUsers).where(eq(adminUsers.email, normalized)).limit(1);
  return rows[0] ?? null;
}

export async function getAdminUserById(id: number): Promise<AdminUser | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adminUsers).orderBy(adminUsers.createdAt);
}

export async function touchAdminLastSignedIn(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(adminUsers).set({ lastSignedIn: new Date() }).where(eq(adminUsers.id, id));
}

export async function createAdminUser(input: {
  email: string;
  password: string;
  name?: string | null;
  role?: AdminRole;
  allowedSections?: AdminSection[];
}): Promise<AdminUser> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const email = input.email.trim().toLowerCase();
  const passwordHash = hashPassword(input.password);
  await db.insert(adminUsers).values({
    email,
    passwordHash,
    name: input.name ?? null,
    role: input.role ?? "full",
    allowedSections: input.allowedSections?.length ? input.allowedSections.join(",") : null,
  });
  const created = await getAdminUserByEmail(email);
  if (!created) throw new Error("Falha ao criar administrador");
  return created;
}

export async function updateAdminUser(
  id: number,
  input: { name?: string | null; role?: AdminRole; allowedSections?: AdminSection[] | null; password?: string }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const updateSet: Record<string, unknown> = {};
  if (input.name !== undefined) updateSet.name = input.name;
  if (input.role !== undefined) updateSet.role = input.role;
  if (input.allowedSections !== undefined) {
    updateSet.allowedSections = input.allowedSections?.length ? input.allowedSections.join(",") : null;
  }
  if (input.password) updateSet.passwordHash = hashPassword(input.password);
  if (Object.keys(updateSet).length === 0) return;
  await db.update(adminUsers).set(updateSet).where(eq(adminUsers.id, id));
}

export async function deleteAdminUser(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(adminUsers).where(eq(adminUsers.id, id));
}

export async function countOwners(): Promise<number> {
  const all = await listAdminUsers();
  return all.filter(a => a.role === "owner").length;
}
