import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { runAdmin } from "@/admin/run";
import { accounts, memberships, sites, users } from "@/db/schema";
import { getUserFromRequest } from "@/lib/auth";
import { authenticateSite } from "@/lib/site-auth";
import { verifyWebhook, signWebhookBody } from "@davimurta/stilus-shared";
import { createSite, createUser, db, login } from "../helpers";

async function admin(args: string[], stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runAdmin(db(), args, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    readStdin: async () => stdin,
  });
  return { code, out, err };
}

const valueOf = (lines: string[], name: string) =>
  lines.find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";

describe("create-user", () => {
  it("creates a user with a generated password that works for login, shown once", async () => {
    const result = await admin(["create-user", "--email", "Ana@Example.com", "--name", "Ana"]);

    expect(result.code).toBe(0);
    expect(result.out[0]).toMatch(/^Usuário criado: ana@example\.com/);
    const password = result.out[1]?.replace("Senha (mostrada só agora): ", "") ?? "";
    expect(password).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(await login("ana@example.com", password)).toEqual(expect.any(String));
  });

  it("reads the password from stdin and does not print it", async () => {
    const result = await admin(
      ["create-user", "--email", "bia@example.com", "--name", "Bia", "--password-stdin"],
      "uma-senha-bem-longa\n",
    );
    expect(result.code).toBe(0);
    expect(result.out.join("\n")).not.toContain("uma-senha-bem-longa");
    expect(await login("bia@example.com", "uma-senha-bem-longa")).toEqual(expect.any(String));
  });

  it("rejects a short password, a bad email and a duplicate", async () => {
    expect(
      (
        await admin(
          ["create-user", "--email", "c@example.com", "--name", "C", "--password-stdin"],
          "curta",
        )
      ).err[0],
    ).toMatch(/pelo menos 12/);
    expect((await admin(["create-user", "--email", "nope", "--name", "X"])).code).toBe(1);
    await createUser("dup@example.com");
    const duplicate = await admin(["create-user", "--email", "dup@example.com", "--name", "D"]);
    expect(duplicate.code).toBe(1);
    expect(duplicate.err[0]).toMatch(/Já existe/);
  });

  it("explains a missing option", async () => {
    const result = await admin(["create-user", "--email", "x@example.com"]);
    expect(result).toMatchObject({ code: 1, err: ["Falta --name."] });
  });
});

describe("set-password", () => {
  it("changes the password and ends the user's sessions", async () => {
    const user = await createUser("ana@example.com");
    const oldToken = await login(user.email);

    const result = await admin(
      ["set-password", "--email", "ana@example.com", "--password-stdin"],
      "nova-senha-segura-123",
    );

    expect(result.code).toBe(0);
    expect(
      await getUserFromRequest(
        new Request("http://panel.test", { headers: { authorization: `Bearer ${oldToken}` } }),
      ),
    ).toBeNull();
    await expect(login(user.email)).rejects.toThrow();
    expect(await login(user.email, "nova-senha-segura-123")).toEqual(expect.any(String));
  });

  it("fails for an unknown user", async () => {
    const result = await admin(["set-password", "--email", "ghost@example.com"]);
    expect(result.code).toBe(1);
    expect(result.err[0]).toMatch(/não encontrado/);
  });
});

describe("create-site", () => {
  it("creates the site, makes the owner admin and prints the settings once", async () => {
    const owner = await createUser("dono@example.com");
    const result = await admin([
      "create-site",
      "--name",
      "KMs pela Vida",
      "--domain",
      "kmspelavida.com.br",
      "--revalidate-url",
      "https://kmspelavida.com.br/api/stilus/revalidate",
      "--owner",
      "dono@example.com",
    ]);

    expect(result.code).toBe(0);
    const siteId = valueOf(result.out, "STILUS_SITE_ID");
    const apiKey = valueOf(result.out, "STILUS_SITE_KEY");
    const secret = valueOf(result.out, "STILUS_REVALIDATE_SECRET");
    expect(secret.length).toBeGreaterThanOrEqual(32);

    expect(await authenticateSite(db(), siteId, `Bearer ${apiKey}`)).toEqual({ ok: true, siteId });
    const [site] = await db().select().from(sites).where(eq(sites.id, siteId));
    expect(site?.apiKeyHash).not.toBe(apiKey);
    const body = JSON.stringify({ siteId, keys: [], ts: Date.now() });
    expect(
      verifyWebhook({ body, signature: signWebhookBody(body, site!.revalidateSecret), secret }).ok,
    ).toBe(true);
    const [membership] = await db()
      .select()
      .from(memberships)
      .where(eq(memberships.siteId, siteId));
    expect(membership).toMatchObject({ userId: owner.id, role: "admin" });
  });

  it("rejects an invalid revalidate URL and an unknown owner", async () => {
    await createUser("dono@example.com");
    const base = ["create-site", "--name", "X", "--domain", "x.com"];
    expect(
      (await admin([...base, "--revalidate-url", "nope", "--owner", "dono@example.com"])).code,
    ).toBe(1);
    expect(
      (
        await admin([
          ...base,
          "--revalidate-url",
          "https://x.com/r",
          "--owner",
          "ghost@example.com",
        ])
      ).code,
    ).toBe(1);
    expect(await db().select().from(sites)).toEqual([]);
  });
});

describe("rotate-site-key", () => {
  it("replaces the key: the old one stops working", async () => {
    const { site, apiKey } = await createSite();
    const result = await admin(["rotate-site-key", "--site", site.id]);
    const newKey = valueOf(result.out, "STILUS_SITE_KEY");

    expect(await authenticateSite(db(), site.id, `Bearer ${apiKey}`)).toEqual({ ok: false });
    expect(await authenticateSite(db(), site.id, `Bearer ${newKey}`)).toMatchObject({ ok: true });
  });
});

describe("grant and revoke", () => {
  it("grants, changes the role and revokes access", async () => {
    const { site } = await createSite();
    const user = await createUser("ed@example.com");

    expect(
      (await admin(["grant", "--email", "ed@example.com", "--site", site.id, "--role", "editor"]))
        .code,
    ).toBe(0);
    await admin(["grant", "--email", "ed@example.com", "--site", site.id, "--role", "admin"]);
    const rows = await db().select().from(memberships).where(eq(memberships.userId, user.id));
    expect(rows).toEqual([expect.objectContaining({ role: "admin" })]);

    expect((await admin(["revoke", "--email", "ed@example.com", "--site", site.id])).code).toBe(0);
    expect(await db().select().from(memberships).where(eq(memberships.userId, user.id))).toEqual(
      [],
    );
    expect((await admin(["revoke", "--email", "ed@example.com", "--site", site.id])).code).toBe(1);
  });

  it("rejects an unknown role or site", async () => {
    const { site } = await createSite();
    await createUser("ed@example.com");
    expect(
      (await admin(["grant", "--email", "ed@example.com", "--site", site.id, "--role", "owner"]))
        .code,
    ).toBe(1);
    expect(
      (
        await admin([
          "grant",
          "--email",
          "ed@example.com",
          "--site",
          "6f1d2c3b-4a59-4e8f-9a0b-1c2d3e4f5a6b",
          "--role",
          "editor",
        ])
      ).code,
    ).toBe(1);
  });
});

describe("usage", () => {
  it("prints usage for an unknown command", async () => {
    const result = await admin(["drop-database"]);
    expect(result.code).toBe(1);
    expect(result.err[0]).toMatch(/^Uso:/);
  });

  it("lists sites", async () => {
    const { site } = await createSite();
    expect((await admin(["list-sites"])).out).toEqual([`${site.id}  Test site  example.test`]);
  });
});

it("never stores the generated password in clear text", async () => {
  const result = await admin(["create-user", "--email", "z@example.com", "--name", "Z"]);
  const password = result.out[1]?.split(": ")[1] ?? "";
  const [user] = await db().select().from(users).where(eq(users.email, "z@example.com"));
  const [account] = await db().select().from(accounts).where(eq(accounts.userId, user!.id));
  expect(JSON.stringify({ user, account })).not.toContain(password);
  expect(account?.password).toMatch(/^\$argon2id\$/);
});
