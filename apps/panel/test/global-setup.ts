import postgres from "postgres";
import { runMigrations } from "../src/db/migrate";
import { TEST_DATABASE_URL } from "./env";

/** Recreates the test database schema from the migrations once per test run. */
export default async function setup(): Promise<void> {
  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );
  } finally {
    await sql.end();
  }
  await runMigrations(TEST_DATABASE_URL);
}
