// Usage: tsx e2e/support/wait-for.ts <url> — exits once the URL answers (any status).
const target = process.argv[2];
if (!target) throw new Error("wait-for: missing URL");

const deadline = Date.now() + 120_000;
while (Date.now() < deadline) {
  try {
    await fetch(target);
    process.exit(0);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
console.error(`wait-for: ${target} did not answer in time`);
process.exit(1);

export {};
