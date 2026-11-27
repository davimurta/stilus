import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { z } from "zod";
import { getDb } from "../db/client";
import { accounts, sessions, users, verifications } from "../db/schema";
import { hashPassword, verifyPassword } from "./passwords";

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().optional(),
});

function createAuth() {
  const env = envSchema.parse(process.env);
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    ...(env.BETTER_AUTH_URL ? { baseURL: env.BETTER_AUTH_URL } : {}),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    user: { modelName: "user" },
    emailAndPassword: {
      enabled: true,
      // Accounts are created by an admin (seed now, panel later). No public sign-up.
      disableSignUp: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    session: { expiresIn: 60 * 60 * 24 * 7 },
    advanced: { database: { generateId: "uuid" } },
    // Sessions travel as `Authorization: Bearer <token>` from the site relay, not as cookies.
    plugins: [bearer()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Lazily created so importing a route never needs the env at build time. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

export type AuthenticatedUser = { id: string; name: string; email: string };

/** The user behind `Authorization: Bearer <session token>`, or null. */
export async function getUserFromRequest(request: Request): Promise<AuthenticatedUser | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const session = await getAuth().api.getSession({
    headers: new Headers({ authorization }),
  });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}
