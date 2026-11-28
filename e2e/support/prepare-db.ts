// Resets the e2e database, applies the migrations, seeds it and stores the API_TEXTS values.
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { createDatabase } from "../../apps/panel/src/db/client";
import { runMigrations } from "../../apps/panel/src/db/migrate";
import { texts } from "../../apps/panel/src/db/schema";
import { seed } from "../../apps/panel/src/db/seed";
import { createUserWithPassword } from "../../apps/panel/src/lib/users";
import {
  ADMIN,
  CHANGER,
  API_TEXTS,
  E2E_DATABASE_URL,
  OUTSIDER,
  REVALIDATE_SECRET,
  SITE_ID,
  SITE_KEY,
  SITE_URL,
} from "./env";

const url = new URL(E2E_DATABASE_URL);
const databaseName = url.pathname.slice(1);

const admin = postgres({ ...parse(url), database: "postgres", max: 1, onnotice: () => {} });
try {
  const existing = await admin`SELECT 1 FROM pg_database WHERE datname = ${databaseName}`;
  if (existing.length === 0) await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
} finally {
  await admin.end();
}

const reset = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  await reset.unsafe(
    "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
  );
} finally {
  await reset.end();
}

await runMigrations(E2E_DATABASE_URL);

const { db, sql } = createDatabase(E2E_DATABASE_URL);
try {
  await seed(db, {
    adminEmail: ADMIN.email,
    adminPassword: ADMIN.password,
    siteId: SITE_ID,
    siteKey: SITE_KEY,
    revalidateUrl: `${SITE_URL}/api/stilus/revalidate`,
    revalidateSecret: REVALIDATE_SECRET,
  });
  await createUserWithPassword(db, { name: "Outsider", ...OUTSIDER });
  await createUserWithPassword(db, { name: "Changer", ...CHANGER });
  for (const [key, value] of Object.entries(API_TEXTS)) {
    await db
      .update(texts)
      .set({ value })
      .where(and(eq(texts.siteId, SITE_ID), eq(texts.key, key)));
  }
} finally {
  await sql.end();
}
console.log("[e2e] database ready");

function parse(u: URL) {
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}
