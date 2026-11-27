import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { isValidTextKey } from "@stilus/shared";
import { exampleSiteTexts } from "@/db/example-site-texts";
import { accounts, sites, texts, users } from "@/db/schema";
import { seed } from "@/db/seed";
import { authenticateSite } from "@/lib/site-auth";
import { db } from "../helpers";

const options = {
  adminEmail: "Admin@Example.com",
  adminPassword: "dev-password-123",
  siteId: "00000000-0000-4000-8000-000000000001",
  siteKey: "stilus_sk_test_seed_key_0000000000000000000000",
  revalidateUrl: "http://localhost:3100/api/stilus/revalidate",
  revalidateSecret: "test-revalidate-secret-0000000000000000",
};

describe("development seed", () => {
  it("uses only valid and unique text keys", () => {
    const keys = exampleSiteTexts.map((text) => text.key);
    expect(keys.filter((key) => !isValidTextKey(key))).toEqual([]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("creates the admin, the example site and its texts", async () => {
    const result = await seed(db(), options);

    expect(result.textCount).toBe(exampleSiteTexts.length);
    const [admin] = await db().select().from(users);
    expect(admin?.email).toBe("admin@example.com");
    const [account] = await db().select().from(accounts);
    expect(account?.userId).toBe(admin?.id);
    expect(account?.providerId).toBe("credential");
    expect(account?.password).toMatch(/^\$argon2id\$/);

    const rows = await db().select().from(texts).where(eq(texts.siteId, options.siteId));
    expect(rows).toHaveLength(exampleSiteTexts.length);
    expect(rows.every((row) => row.value === row.defaultValue)).toBe(true);
  });

  it("stores only the hash of the site key, and the key authenticates", async () => {
    await seed(db(), options);

    const [site] = await db().select().from(sites);
    expect(site?.apiKeyHash).not.toContain(options.siteKey);
    expect(await authenticateSite(db(), options.siteId, `Bearer ${options.siteKey}`)).toEqual({
      ok: true,
      siteId: options.siteId,
    });
  });

  it("is idempotent and keeps edited values", async () => {
    await seed(db(), options);
    await db().update(texts).set({ value: "Editado" }).where(eq(texts.key, "home.hero.title"));

    await seed(db(), options);

    expect(await db().select().from(users)).toHaveLength(1);
    expect(await db().select().from(sites)).toHaveLength(1);
    const [edited] = await db().select().from(texts).where(eq(texts.key, "home.hero.title"));
    expect(edited?.value).toBe("Editado");
  });
});
