import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

const envSchema = z.object({ DATABASE_URL: z.url() });

let instance: { db: Database; sql: postgres.Sql } | undefined;

export function createDatabase(url: string) {
  const sql = postgres(url, { max: 10 });
  return { db: drizzle(sql, { schema }), sql };
}

/** Lazily connects using DATABASE_URL, so importing this module never needs the env at build time. */
export function getDb(): Database {
  if (!instance) {
    const env = envSchema.parse(process.env);
    instance = createDatabase(env.DATABASE_URL);
  }
  return instance.db;
}
