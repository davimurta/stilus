import { hash } from "@node-rs/argon2";
import type { Database } from "./client";
import { exampleSiteTexts } from "./example-site-texts";
import { memberships, sites, texts, users } from "./schema";
import { hashSiteApiKey } from "../lib/site-auth";

export type SeedOptions = {
  adminEmail: string;
  adminPassword: string;
  siteId: string;
  siteKey: string;
  revalidateUrl: string;
  revalidateSecret: string;
};

/**
 * Development seed: one admin user, the example site and its texts.
 * Idempotent: running it twice keeps existing text values (edits survive a re-seed).
 */
export async function seed(db: Database, options: SeedOptions): Promise<{ textCount: number }> {
  const passwordHash = await hash(options.adminPassword);

  return db.transaction(async (tx) => {
    const [admin] = await tx
      .insert(users)
      .values({ name: "Admin", email: options.adminEmail.toLowerCase(), passwordHash })
      .onConflictDoUpdate({
        target: users.email,
        set: { passwordHash },
      })
      .returning({ id: users.id });
    if (!admin) throw new Error("Seed failed to upsert the admin user.");

    await tx
      .insert(sites)
      .values({
        id: options.siteId,
        name: "Site de exemplo",
        domain: "localhost:3100",
        apiKeyHash: hashSiteApiKey(options.siteKey),
        revalidateUrl: options.revalidateUrl,
        revalidateSecret: options.revalidateSecret,
        ownerId: admin.id,
      })
      .onConflictDoUpdate({
        target: sites.id,
        set: {
          apiKeyHash: hashSiteApiKey(options.siteKey),
          revalidateUrl: options.revalidateUrl,
          revalidateSecret: options.revalidateSecret,
        },
      });

    await tx
      .insert(memberships)
      .values({ userId: admin.id, siteId: options.siteId, role: "admin" })
      .onConflictDoNothing();

    await tx
      .insert(texts)
      .values(
        exampleSiteTexts.map((text) => ({
          siteId: options.siteId,
          key: text.key,
          page: text.page,
          description: text.description,
          value: text.value,
          defaultValue: text.value,
          kind: text.kind,
          maxLength: text.maxLength,
        })),
      )
      .onConflictDoNothing({ target: [texts.siteId, texts.key] });

    return { textCount: exampleSiteTexts.length };
  });
}
