import { z } from "zod";
import { createDatabase } from "../db/client";
import { runAdmin } from "./run";

const env = z.object({ DATABASE_URL: z.url() }).parse(process.env);
const { db, sql } = createDatabase(env.DATABASE_URL);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

try {
  process.exitCode = await runAdmin(db, process.argv.slice(2), {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    readStdin,
  });
} finally {
  await sql.end();
}
