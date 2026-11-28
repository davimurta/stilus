import type { Database } from "../db/client";
import {
  AdminError,
  adminCreateSite,
  adminCreateUser,
  adminGrant,
  adminListSites,
  adminRevoke,
  adminRotateSiteKey,
  adminSetPassword,
} from "../lib/admin";

export const USAGE = `Uso: pnpm --filter panel admin <comando> [opções]

  create-user     --email <e-mail> --name <nome> [--password-stdin]
  set-password    --email <e-mail> [--password-stdin]      (encerra as sessões do usuário)
  create-site     --name <nome> --domain <domínio> --revalidate-url <url> --owner <e-mail>
  rotate-site-key --site <id>
  grant           --email <e-mail> --site <id> --role admin|editor
  revoke          --email <e-mail> --site <id>
  list-sites

Sem --password-stdin, uma senha aleatória é gerada e mostrada uma única vez.`;

export type AdminIo = {
  out: (line: string) => void;
  err: (line: string) => void;
  readStdin: () => Promise<string>;
};

function options(args: string[]): Map<string, string | true> {
  const map = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) throw new AdminError(`Argumento inesperado: ${arg}`);
    const next = args[index + 1];
    if (next === undefined || next.startsWith("--")) map.set(arg.slice(2), true);
    else {
      map.set(arg.slice(2), next);
      index += 1;
    }
  }
  return map;
}

function required(opts: Map<string, string | true>, name: string): string {
  const value = opts.get(name);
  if (typeof value !== "string") throw new AdminError(`Falta --${name}.`);
  return value;
}

async function password(opts: Map<string, string | true>, io: AdminIo) {
  return opts.get("password-stdin") === true ? (await io.readStdin()).trim() : undefined;
}

/** Runs an admin command and returns the exit code. Secrets are printed once, never stored. */
export async function runAdmin(db: Database, args: string[], io: AdminIo): Promise<number> {
  const [command, ...rest] = args;
  try {
    const opts = options(rest);
    switch (command) {
      case "create-user": {
        const given = await password(opts, io);
        const { user, password: pw } = await adminCreateUser(db, {
          email: required(opts, "email"),
          name: required(opts, "name"),
          ...(given !== undefined ? { password: given } : {}),
        });
        io.out(`Usuário criado: ${user.email} (${user.id})`);
        if (given === undefined) io.out(`Senha (mostrada só agora): ${pw}`);
        return 0;
      }
      case "set-password": {
        const given = await password(opts, io);
        const { user, password: pw } = await adminSetPassword(db, {
          email: required(opts, "email"),
          ...(given !== undefined ? { password: given } : {}),
        });
        io.out(`Senha alterada para ${user.email}. Sessões encerradas.`);
        if (given === undefined) io.out(`Nova senha (mostrada só agora): ${pw}`);
        return 0;
      }
      case "create-site": {
        const { site, apiKey, revalidateSecret } = await adminCreateSite(db, {
          name: required(opts, "name"),
          domain: required(opts, "domain"),
          revalidateUrl: required(opts, "revalidate-url"),
          ownerEmail: required(opts, "owner"),
        });
        io.out(`Site criado: ${site.name} (${site.id})`);
        io.out("Configure no site (mostrado só agora, guarde em lugar seguro):");
        io.out(`STILUS_SITE_ID=${site.id}`);
        io.out(`STILUS_SITE_KEY=${apiKey}`);
        io.out(`STILUS_REVALIDATE_SECRET=${revalidateSecret}`);
        return 0;
      }
      case "rotate-site-key": {
        const { site, apiKey } = await adminRotateSiteKey(db, required(opts, "site"));
        io.out(`Nova chave de ${site.name}. A anterior deixou de funcionar.`);
        io.out(`STILUS_SITE_KEY=${apiKey}`);
        return 0;
      }
      case "grant": {
        const { user, site, role } = await adminGrant(db, {
          email: required(opts, "email"),
          siteId: required(opts, "site"),
          role: required(opts, "role"),
        });
        io.out(`${user.email} agora é ${role} em ${site.name}.`);
        return 0;
      }
      case "revoke": {
        const { user, site } = await adminRevoke(db, {
          email: required(opts, "email"),
          siteId: required(opts, "site"),
        });
        io.out(`${user.email} não tem mais acesso a ${site.name}.`);
        return 0;
      }
      case "list-sites": {
        for (const site of await adminListSites(db)) {
          io.out(`${site.id}  ${site.name}  ${site.domain}`);
        }
        return 0;
      }
      default:
        io.err(USAGE);
        return command === undefined || command === "help" ? 0 : 1;
    }
  } catch (error) {
    if (error instanceof AdminError) {
      io.err(error.message);
      return 1;
    }
    throw error;
  }
}
