import { z } from "zod";
import { createDatabase } from "./client";
import { seed } from "./seed";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run the development seed with NODE_ENV=production.");
  process.exit(1);
}

const env = z
  .object({
    DATABASE_URL: z.url(),
    SEED_ADMIN_EMAIL: z.email(),
    SEED_ADMIN_PASSWORD: z.string().min(12),
    SEED_SITE_ID: z.uuid(),
    SEED_SITE_KEY: z.string().min(32),
    SEED_SITE_REVALIDATE_URL: z.url(),
    SEED_SITE_REVALIDATE_SECRET: z.string().min(32),
  })
  .parse(process.env);

const { db, sql } = createDatabase(env.DATABASE_URL);
try {
  const result = await seed(db, {
    adminEmail: env.SEED_ADMIN_EMAIL,
    adminPassword: env.SEED_ADMIN_PASSWORD,
    siteId: env.SEED_SITE_ID,
    siteKey: env.SEED_SITE_KEY,
    revalidateUrl: env.SEED_SITE_REVALIDATE_URL,
    revalidateSecret: env.SEED_SITE_REVALIDATE_SECRET,
  });
  console.log(`Seed done: site ${env.SEED_SITE_ID}, ${result.textCount} texts.`);
} finally {
  await sql.end();
}
