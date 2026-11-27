#!/usr/bin/env node
import { existsSync } from "node:fs";
import { run } from "./run.js";

// Local runs read .env.local / .env like Next.js does; CI passes real env vars, which win.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const code = await run(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  env: process.env,
});
process.exitCode = code;
