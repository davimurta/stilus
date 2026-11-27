import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { activityLog } from "@/db/schema";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { POST as logout } from "@/app/api/v1/auth/logout/route";
import { getUserFromRequest } from "@/lib/auth";
import { TEST_PASSWORD, addMember, createSite, createUser, db } from "../helpers";

function loginRequest(body: unknown) {
  return login(
    new Request("http://panel.test/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const withToken = (token: string) =>
  new Request("http://panel.test/x", { headers: { authorization: `Bearer ${token}` } });

describe("POST /api/v1/auth/login", () => {
  it("returns a session token, the user and the sites the user can edit", async () => {
    const user = await createUser("editor@example.com");
    const { site } = await createSite();
    await addMember(user.id, site.id, "editor");

    const response = await loginRequest({ email: "editor@example.com", password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      token: expect.any(String),
      user: { id: user.id, name: "Test user", email: "editor@example.com" },
      sites: [{ id: site.id, name: site.name, domain: site.domain, role: "editor" }],
    });
    expect(await getUserFromRequest(withToken(body.token))).toMatchObject({ id: user.id });
  });

  it("accepts the email in any letter case", async () => {
    await createUser("editor@example.com");
    const response = await loginRequest({ email: "Editor@Example.COM", password: TEST_PASSWORD });
    expect(response.status).toBe(200);
  });

  it("returns an empty site list for a user without memberships", async () => {
    await createUser("nobody@example.com");
    const response = await loginRequest({ email: "nobody@example.com", password: TEST_PASSWORD });
    expect((await response.json()).sites).toEqual([]);
  });

  it("rejects a wrong password and an unknown email with the same answer", async () => {
    await createUser("editor@example.com");
    const wrongPassword = await loginRequest({
      email: "editor@example.com",
      password: "nope-nope",
    });
    const unknownEmail = await loginRequest({
      email: "ghost@example.com",
      password: TEST_PASSWORD,
    });

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "invalid_credentials", message: "E-mail ou senha incorretos." },
      });
    }
  });

  it.each([
    ["not JSON", "{"],
    ["missing password", { email: "a@example.com" }],
    ["invalid email", { email: "not-an-email", password: "x" }],
    ["empty password", { email: "a@example.com", password: "" }],
  ])("rejects an invalid body (%s)", async (_label, body) => {
    const response = await loginRequest(body);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
  });
});

describe("login rate limiting", () => {
  const wrong = { email: "editor@example.com", password: "wrong-password" };
  const right = { email: "editor@example.com", password: TEST_PASSWORD };

  it("blocks the email after 5 failures, even with the right password", async () => {
    await createUser("editor@example.com");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await loginRequest(wrong)).status).toBe(401);
    }

    const blocked = await loginRequest(right);

    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe("too_many_attempts");
  });

  it("counts failures per email, in any letter case", async () => {
    await createUser("editor@example.com");
    await createUser("other@example.com");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await loginRequest({ ...wrong, email: attempt % 2 ? "EDITOR@example.com" : wrong.email });
    }
    expect((await loginRequest(right)).status).toBe(429);
    expect(
      (await loginRequest({ email: "other@example.com", password: TEST_PASSWORD })).status,
    ).toBe(200);
  });

  it("allows 4 failures and then a successful login", async () => {
    await createUser("editor@example.com");
    for (let attempt = 0; attempt < 4; attempt += 1) await loginRequest(wrong);
    expect((await loginRequest(right)).status).toBe(200);
  });

  it("lets the email in again once the failures are older than 15 minutes", async () => {
    await createUser("editor@example.com");
    for (let attempt = 0; attempt < 5; attempt += 1) await loginRequest(wrong);
    await db()
      .update(activityLog)
      .set({ createdAt: new Date(Date.now() - 16 * 60 * 1000) })
      .where(eq(activityLog.action, "auth.login_failed"));

    expect((await loginRequest(right)).status).toBe(200);
  });

  it("also counts failures for unknown emails", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await loginRequest({ email: "ghost@example.com", password: "x" });
    }
    expect((await loginRequest({ email: "ghost@example.com", password: "x" })).status).toBe(429);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the session token", async () => {
    await createUser("editor@example.com");
    const { token } = await (
      await loginRequest({ email: "editor@example.com", password: TEST_PASSWORD })
    ).json();

    const response = await logout(
      new Request("http://panel.test/api/v1/auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(await getUserFromRequest(withToken(token))).toBeNull();
  });

  it("answers 200 without a token", async () => {
    const response = await logout(
      new Request("http://panel.test/api/v1/auth/logout", { method: "POST" }),
    );
    expect(response.status).toBe(200);
  });
});

describe("session tokens", () => {
  it.each(["", "garbage", "a.b", "Bearer"])("rejects the forged token %j", async (token) => {
    expect(await getUserFromRequest(withToken(token))).toBeNull();
  });
});
