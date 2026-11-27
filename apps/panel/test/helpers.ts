import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { getDb } from "../src/db/client";
import { sites, texts, users } from "../src/db/schema";
import { generateSiteApiKey, hashSiteApiKey } from "../src/lib/site-auth";

export const db = () => getDb();

export async function resetDatabase(): Promise<void> {
  await db().execute(
    "TRUNCATE activity_log, text_versions, texts, memberships, sites, users RESTART IDENTITY CASCADE",
  );
}

export async function createUser(email = `user-${randomBytes(4).toString("hex")}@example.com`) {
  const [user] = await db()
    .insert(users)
    .values({ name: "Test user", email, passwordHash: await hash("test-password-123") })
    .returning();
  if (!user) throw new Error("Failed to create user");
  return user;
}

export async function createSite() {
  const owner = await createUser();
  const apiKey = generateSiteApiKey();
  const [site] = await db()
    .insert(sites)
    .values({
      name: "Test site",
      domain: "example.test",
      apiKeyHash: hashSiteApiKey(apiKey),
      revalidateUrl: "http://example.test/api/stilus/revalidate",
      revalidateSecret: randomBytes(32).toString("hex"),
      ownerId: owner.id,
    })
    .returning();
  if (!site) throw new Error("Failed to create site");
  return { site, apiKey, owner };
}

export async function createText(
  siteId: string,
  key: string,
  value: string,
  status: "active" | "orphan" = "active",
) {
  const [text] = await db()
    .insert(texts)
    .values({ siteId, key, value, defaultValue: value, status })
    .returning();
  if (!text) throw new Error("Failed to create text");
  return text;
}
