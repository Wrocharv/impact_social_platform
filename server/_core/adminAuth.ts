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

export type AdminSessionPayload = {
  id: number;
  email: string;
  name: string | null;
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

export async function createAdminSessionToken(admin: AdminUser): Promise<string> {
  const payload: AdminSessionPayload = { id: admin.id, email: admin.email, name: admin.name };
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + ADMIN_SESSION_MS) / 1000))
    .sign(getSecretKey());
}

export async function verifyAdminSessionToken(token: string): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.id !== "number" || typeof payload.email !== "string") return null;
    return { id: payload.id, email: payload.email, name: typeof payload.name === "string" ? payload.name : null };
  } catch {
    return null;
  }
}

export async function getAdminSessionFromRequest(req: Request): Promise<AdminSessionPayload | null> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!token) return null;
  return verifyAdminSessionToken(token);
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

export async function touchAdminLastSignedIn(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(adminUsers).set({ lastSignedIn: new Date() }).where(eq(adminUsers.id, id));
}

export async function createAdminUser(input: { email: string; password: string; name?: string | null }): Promise<AdminUser> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const email = input.email.trim().toLowerCase();
  const passwordHash = hashPassword(input.password);
  await db.insert(adminUsers).values({ email, passwordHash, name: input.name ?? null });
  const created = await getAdminUserByEmail(email);
  if (!created) throw new Error("Falha ao criar administrador");
  return created;
}

export async function countAdminUsers(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select().from(adminUsers);
  return rows.length;
}
