import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROUTE = `import { createStilusHandlers } from "@stilus/next";

export const { GET, POST } = createStilusHandlers();
`;

const EDIT_PAGE = `import { LoginForm } from "@stilus/next/client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar para editar",
  robots: { index: false, follow: false },
};

export default function EditLoginPage() {
  return <LoginForm />;
}
`;

const ENV_EXAMPLE = `# Stilus (server-only, never prefix with NEXT_PUBLIC_).
# Values come from \`admin create-site\` on the Stilus panel.
STILUS_SITE_ID=
STILUS_API_URL=
STILUS_SITE_KEY=
STILUS_REVALIDATE_SECRET=
`;

export type InitResult = {
  created: string[];
  skipped: string[];
  warnings: string[];
  appDir: string;
};

function findAppDir(root: string): string | null {
  for (const candidate of ["src/app", "app"]) {
    if (existsSync(join(root, candidate))) return candidate;
  }
  return null;
}

function nextMajor(root: string): number | null {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const range = pkg.dependencies?.next ?? pkg.devDependencies?.next;
    const major = range?.match(/(\d+)/)?.[1];
    return major ? Number(major) : null;
  } catch {
    return null;
  }
}

/**
 * Adds the Stilus files to a Next.js App Router project. Never overwrites a file:
 * an existing one is reported as skipped.
 */
export function initProject(root: string): InitResult {
  if (!existsSync(join(root, "package.json"))) {
    throw new Error(
      `No package.json in ${root}. Run stilus init in the root of a Next.js project.`,
    );
  }
  const appDir = findAppDir(root);
  if (!appDir) throw new Error("No app/ or src/app/ folder found. Stilus needs the App Router.");

  const result: InitResult = { created: [], skipped: [], warnings: [], appDir };
  const major = nextMajor(root);
  if (major === null) result.warnings.push("Next.js not found in package.json.");
  else if (major !== 16)
    result.warnings.push(`@stilus/next supports Next 16; this project uses ${major}.`);

  const write = (path: string, content: string) => {
    const full = join(root, path);
    if (existsSync(full)) {
      result.skipped.push(path);
      return;
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    result.created.push(path);
  };

  write(join(appDir, "api/stilus/[...stilus]/route.ts"), ROUTE);
  write(join(appDir, "editar/page.tsx"), EDIT_PAGE);

  const envPath = join(root, ".env.example");
  const envFile = relative(root, envPath);
  if (!existsSync(envPath)) {
    writeFileSync(envPath, ENV_EXAMPLE);
    result.created.push(envFile);
  } else if (readFileSync(envPath, "utf8").includes("STILUS_SITE_ID")) {
    result.skipped.push(envFile);
  } else {
    const current = readFileSync(envPath, "utf8");
    writeFileSync(envPath, `${current}${current.endsWith("\n") ? "" : "\n"}\n${ENV_EXAMPLE}`);
    result.created.push(`${envFile} (STILUS_* appended)`);
  }
  return result;
}

export const LAYOUT_INSTRUCTIONS = `Add the loader to the root layout (it renders nothing for visitors):

  import { StilusLoader } from "@stilus/next/loader";
  // inside <body>, after the content:
  <StilusLoader />`;

export const NEXT_STEPS = `Next steps:
  1. Install the SDK: pnpm add @stilus/next
  2. Create the site on the panel (admin create-site) and fill STILUS_* in .env.local
     and in your host's environment.
  3. Mark texts: <Text k="home.hero.title">Default text</Text>, await t("home.meta.title", "...").
  4. Run: stilus sync (locally or in CI, before next build).`;
