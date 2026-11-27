import { z } from "zod";
import { runMigrations } from "./migrate";

const env = z.object({ DATABASE_URL: z.url() }).parse(process.env);
await runMigrations(env.DATABASE_URL);
console.log("Migrations applied.");
