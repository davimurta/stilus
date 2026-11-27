import { randomBytes } from "node:crypto";
import { getDb } from "../src/db/client";
import { memberships, sites, texts } from "../src/db/schema";
import { generateSiteApiKey, hashSiteApiKey } from "../src/lib/site-auth";
import { createUserWithPassword } from "../src/lib/users";

export const TEST_PASSWORD = "test-password-123";

export const db = () => getDb();

export async function resetDatabase(): Promise<void> {
  await db().execute(
    "TRUNCATE activity_log, text_versions, texts, memberships, sites, verifications, sessions, accounts, users RESTART IDENTITY CASCADE",
  );
}

export async function createUser(email = `user-${randomBytes(4).toString("hex")}@example.com`) {
  return createUserWithPassword(db(), { name: "Test user", email, password: TEST_PASSWORD });
}

export async function addMember(userId: string, siteId: string, role: "admin" | "editor") {
  await db().insert(memberships).values({ userId, siteId, role });
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

export async function login(email: string, password = TEST_PASSWORD): Promise<string> {
  const { POST } = await import("../src/app/api/v1/auth/login/route");
  const response = await POST(
    new Request("http://panel.test/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  if (response.status !== 200) throw new Error(`login failed: ${response.status}`);
  const body = (await response.json()) as { token: string };
  return body.token;
}
