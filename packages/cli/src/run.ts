import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { LAYOUT_INSTRUCTIONS, NEXT_STEPS, initProject } from "./init.js";
import { scanProject, type ScanProblem } from "./scan.js";
import { readSyncConfig, sendSync } from "./sync.js";

export type Io = {
  out: (line: string) => void;
  err: (line: string) => void;
  env: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

const USAGE = `Usage:
  stilus init [dir]            Add the Stilus route, the /editar page and .env.example
  stilus scan [dir] [--json]   List the editable texts found in the code
  stilus sync [dir]            Scan and send the keys to the central API (needs STILUS_* env)

dir defaults to the current directory.`;

const format = (problem: ScanProblem) =>
  `${problem.location.file}:${problem.location.line}  ${problem.message}`;

/** Runs the CLI and returns the exit code. */
export async function run(args: string[], io: Io): Promise<number> {
  const [command, ...rest] = args;
  const json = rest.includes("--json");
  const directory = resolve(rest.find((arg) => !arg.startsWith("--")) ?? ".");

  if (command !== "scan" && command !== "sync" && command !== "init") {
    io.err(USAGE);
    return command === "help" || command === "--help" ? 0 : 1;
  }
  if (!existsSync(directory)) {
    io.err(`Directory not found: ${directory}`);
    return 1;
  }

  if (command === "init") {
    try {
      const init = initProject(directory);
      for (const warning of init.warnings) io.err(`warning  ${warning}`);
      for (const file of init.created) io.out(`created  ${file}`);
      for (const file of init.skipped) io.out(`skipped  ${file} (already exists)`);
      io.out("");
      io.out(LAYOUT_INSTRUCTIONS);
      io.out("");
      io.out(NEXT_STEPS);
      return 0;
    } catch (error) {
      io.err(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  const result = scanProject(directory);
  for (const warning of result.warnings) io.err(`warning  ${format(warning)}`);
  for (const error of result.errors) io.err(`error    ${format(error)}`);
  if (result.errors.length > 0) {
    io.err(`${result.errors.length} error(s). Fix them before syncing.`);
    return 1;
  }

  if (command === "scan") {
    if (json) io.out(JSON.stringify({ keys: result.keys }, null, 2));
    else {
      for (const key of result.keys) io.out(`${key.key}  ${JSON.stringify(key.defaultValue)}`);
      io.out(`${result.keys.length} text(s) found.`);
    }
    return 0;
  }

  if (result.keys.length === 0) {
    io.err("No texts found. Nothing was sent (an empty sync would orphan every key).");
    return 1;
  }
  try {
    const config = readSyncConfig(io.env);
    const synced = await sendSync(config, result.keys, io.fetchImpl);
    io.out(
      `Synced ${result.keys.length} text(s): ${synced.created.length} created, ` +
        `${synced.orphaned.length} orphaned, ${synced.unchanged.length} unchanged.`,
    );
    for (const key of synced.created) io.out(`  + ${key}`);
    for (const key of synced.orphaned) io.out(`  - ${key} (orphan)`);
    return 0;
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
