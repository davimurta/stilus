import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import { memberships, sessions, sites, users } from "../db/schema";
import { generateSiteApiKey, hashSiteApiKey } from "./site-auth";
import { createUserWithPassword, setUserPassword } from "./users";

export const MIN_PASSWORD_LENGTH = 12;

export class AdminError extends Error {}

/** Random password for new accounts: 18 bytes, base64url (24 characters). */
export function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

function generateRevalidateSecret(): string {
  return randomBytes(32).toString("base64url");
}

const emailSchema = z.email().transform((email) => email.toLowerCase());
const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  .max(256);

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AdminError(`${label}: ${result.error.issues[0]?.message ?? "inválido"}`);
  }
  return result.data;
}

async function findUser(db: Database, email: string) {
  const normalized = parse(emailSchema, email, "E-mail");
  const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  if (!user) throw new AdminError(`Usuário não encontrado: ${normalized}`);
  return user;
}

async function findSite(db: Database, siteId: string) {
  const id = parse(z.uuid(), siteId, "Site");
  const [site] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  if (!site) throw new AdminError(`Site não encontrado: ${id}`);
  return site;
}

export async function adminCreateUser(
  db: Database,
  input: { email: string; name: string; password?: string },
) {
  const email = parse(emailSchema, input.email, "E-mail");
  const name = parse(z.string().trim().min(1).max(200), input.name, "Nome");
  const password = parse(passwordSchema, input.password ?? generatePassword(), "Senha");
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new AdminError(`Já existe um usuário com o e-mail ${email}.`);
  const user = await createUserWithPassword(db, { name, email, password });
  return { user, password };
}

/** Sets a new password and ends every session of the user. */
export async function adminSetPassword(db: Database, input: { email: string; password?: string }) {
  const user = await findUser(db, input.email);
  const password = parse(passwordSchema, input.password ?? generatePassword(), "Senha");
  await setUserPassword(db, user.id, password);
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  return { user, password };
}

export async function adminCreateSite(
  db: Database,
  input: { name: string; domain: string; revalidateUrl: string; ownerEmail: string },
) {
  const name = parse(z.string().trim().min(1).max(200), input.name, "Nome");
  const domain = parse(z.string().trim().min(1).max(253), input.domain, "Domínio");
  const revalidateUrl = parse(z.url(), input.revalidateUrl, "URL de revalidação");
  const owner = await findUser(db, input.ownerEmail);

  const apiKey = generateSiteApiKey();
  const revalidateSecret = generateRevalidateSecret();
  const site = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(sites)
      .values({
        name,
        domain,
        revalidateUrl,
        revalidateSecret,
        apiKeyHash: hashSiteApiKey(apiKey),
        ownerId: owner.id,
      })
      .returning();
    if (!created) throw new AdminError("Falha ao criar o site.");
    await tx.insert(memberships).values({ userId: owner.id, siteId: created.id, role: "admin" });
    return created;
  });
  return { site, apiKey, revalidateSecret };
}

/** Replaces the site API key. The old key stops working at once. */
export async function adminRotateSiteKey(db: Database, siteId: string) {
  const site = await findSite(db, siteId);
  const apiKey = generateSiteApiKey();
  await db
    .update(sites)
    .set({ apiKeyHash: hashSiteApiKey(apiKey) })
    .where(eq(sites.id, site.id));
  return { site, apiKey };
}

export async function adminGrant(
  db: Database,
  input: { email: string; siteId: string; role: string },
) {
  const user = await findUser(db, input.email);
  const site = await findSite(db, input.siteId);
  const role = parse(z.enum(["admin", "editor"]), input.role, "Papel");
  await db
    .insert(memberships)
    .values({ userId: user.id, siteId: site.id, role })
    .onConflictDoUpdate({ target: [memberships.userId, memberships.siteId], set: { role } });
  return { user, site, role };
}

export async function adminRevoke(db: Database, input: { email: string; siteId: string }) {
  const user = await findUser(db, input.email);
  const site = await findSite(db, input.siteId);
  const removed = await db
    .delete(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.siteId, site.id)))
    .returning();
  if (removed.length === 0) throw new AdminError(`${user.email} não tinha acesso a ${site.name}.`);
  return { user, site };
}

export async function adminListSites(db: Database) {
  return db
    .select({ id: sites.id, name: sites.name, domain: sites.domain })
    .from(sites)
    .orderBy(asc(sites.name));
}
