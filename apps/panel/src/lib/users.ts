import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { accounts, memberships, sites, users } from "../db/schema";
import { hashPassword } from "./passwords";

/** Creates a user with an email/password (Better Auth "credential") account. */
export async function createUserWithPassword(
  db: Database,
  input: { name: string; email: string; password: string },
) {
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ name: input.name, email: input.email.toLowerCase(), emailVerified: true })
      .returning();
    if (!user) throw new Error("Failed to create user");
    await tx.insert(accounts).values({
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: passwordHash,
    });
    return user;
  });
}

/** Sets the password of an existing credential account (creates the account if missing). */
export async function setUserPassword(db: Database, userId: string, password: string) {
  const passwordHash = await hashPassword(password);
  const updated = await db
    .update(accounts)
    .set({ password: passwordHash })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .returning({ id: accounts.id });
  if (updated.length === 0) {
    await db
      .insert(accounts)
      .values({ accountId: userId, providerId: "credential", userId, password: passwordHash });
  }
}

export type SiteAccess = { id: string; name: string; domain: string; role: "admin" | "editor" };

export async function listUserSites(db: Database, userId: string): Promise<SiteAccess[]> {
  return db
    .select({ id: sites.id, name: sites.name, domain: sites.domain, role: memberships.role })
    .from(memberships)
    .innerJoin(sites, eq(sites.id, memberships.siteId))
    .where(eq(memberships.userId, userId))
    .orderBy(sites.name);
}

/** Admins and editors of a site can edit its texts. */
export async function canEditSite(db: Database, userId: string, siteId: string) {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.siteId, siteId)))
    .limit(1);
  return row?.role === "admin" || row?.role === "editor";
}
