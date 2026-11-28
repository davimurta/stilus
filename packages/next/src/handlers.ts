import { SIGNATURE_HEADER, textKeySchema, verifyWebhook } from "@davimurta/stilus-shared";
import { revalidateTag } from "next/cache.js";
import { z } from "zod";
import { readHandlerConfig, type HandlerConfig } from "./config.js";
import { SESSION_COOKIE, clearedCookies, readCookie, sessionCookies } from "./cookies.js";
import { siteCacheTag } from "./fetch-texts.js";

const MAX_BODY_BYTES = 64 * 1024;
const CENTRAL_TIMEOUT_MS = 10_000;

type RouteContext = { params: Promise<{ stilus?: string[] }> };

export type StilusHandlerOptions = {
  fetchImpl?: typeof fetch;
  revalidate?: (tag: string) => void;
  env?: Record<string, string | undefined>;
};

function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function error(status: number, code: string, message: string, cookies: string[] = []) {
  return json({ error: { code, message } }, status, cookies);
}

/** Cookie-authenticated actions only accept requests from the site's own pages (CSRF). */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host.split(",")[0]?.trim();
  } catch {
    return false;
  }
}

async function readBody<T extends z.ZodType>(request: Request, schema: T) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as z.infer<T>) : null;
  } catch {
    return null;
  }
}

const loginSchema = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(256),
});
const saveSchema = z.object({ key: textKeySchema, value: z.string() });
const undoSchema = z.object({ key: textKeySchema });

const loginResponseSchema = z.object({
  token: z.string().min(1),
  user: z.object({ name: z.string(), email: z.string() }),
  sites: z.array(z.object({ id: z.string() })),
});

/**
 * Route handlers for `app/api/stilus/[...stilus]/route.ts`:
 * POST login, logout, save, undo (relayed to the central API with the editor's token)
 * and revalidate (signed webhook from the central API).
 */
export function createStilusHandlers(options: StilusHandlerOptions = {}) {
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const revalidate = options.revalidate ?? ((tag: string) => revalidateTag(tag, { expire: 0 }));

  function central(config: HandlerConfig, path: string, init: RequestInit) {
    return fetchImpl(`${config.apiUrl}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(CENTRAL_TIMEOUT_MS),
    });
  }

  /** Passes the central answer through; a rejected session also turns the editor off. */
  async function relay(request: Request, response: Response): Promise<Response> {
    const body: unknown = await response.json().catch(() => ({
      error: { code: "bad_gateway", message: "Resposta inválida do serviço de textos." },
    }));
    const cookies = response.status === 401 ? clearedCookies(request) : [];
    return json(body, response.status, cookies);
  }

  async function login(request: Request, config: HandlerConfig) {
    const body = await readBody(request, loginSchema);
    if (!body) return error(400, "invalid_request", "Informe e-mail e senha.");

    const response = await central(config, "/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return relay(request, response);

    const parsed = loginResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success)
      return error(502, "bad_gateway", "Resposta inválida do serviço de textos.");
    const { token, user, sites } = parsed.data;

    if (!sites.some((site) => site.id === config.siteId)) {
      await central(config, "/api/v1/auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => undefined);
      return error(403, "forbidden", "Sua conta não tem acesso a este site.");
    }
    return json(
      { user: { name: user.name, email: user.email } },
      200,
      sessionCookies(request, token),
    );
  }

  async function logout(request: Request, config: HandlerConfig) {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) {
      await central(config, "/api/v1/auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    return json({ ok: true }, 200, clearedCookies(request));
  }

  async function edit(request: Request, config: HandlerConfig, action: "save" | "undo") {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token)
      return error(401, "unauthorized", "Entre novamente para editar.", clearedCookies(request));

    const textPath = (key: string) =>
      `/api/v1/sites/${encodeURIComponent(config.siteId)}/texts/${encodeURIComponent(key)}`;
    const authorization = `Bearer ${token}`;

    if (action === "save") {
      const body = await readBody(request, saveSchema);
      if (!body) return error(400, "invalid_request", "Chave ou texto inválido.");
      const response = await central(config, textPath(body.key), {
        method: "PUT",
        headers: { "content-type": "application/json", authorization },
        body: JSON.stringify({ value: body.value }),
      });
      return relay(request, response);
    }

    const body = await readBody(request, undoSchema);
    if (!body) return error(400, "invalid_request", "Chave inválida.");
    const response = await central(config, `${textPath(body.key)}/undo`, {
      method: "POST",
      headers: { authorization },
    });
    return relay(request, response);
  }

  async function revalidateWebhook(request: Request, config: HandlerConfig) {
    const body = await request.text();
    const verification = verifyWebhook({
      body,
      signature: request.headers.get(SIGNATURE_HEADER),
      secret: config.revalidateSecret,
    });
    if (!verification.ok) {
      const status = verification.reason === "invalid_payload" ? 400 : 401;
      return error(status, verification.reason, "Webhook rejeitado.");
    }
    if (verification.payload.siteId !== config.siteId) {
      return error(401, "bad_signature", "Webhook rejeitado.");
    }
    revalidate(siteCacheTag(config.siteId));
    return json({ revalidated: true });
  }

  async function POST(request: Request, context: RouteContext): Promise<Response> {
    const action = (await context.params).stilus?.join("/") ?? "";
    const config = readHandlerConfig(options.env ?? process.env);
    if (!config) return error(503, "not_configured", "Stilus não está configurado neste site.");

    if (action === "revalidate") return revalidateWebhook(request, config);

    if (!["login", "logout", "save", "undo"].includes(action)) {
      return error(404, "not_found", "Rota não encontrada.");
    }
    if (!isSameOrigin(request)) return error(403, "forbidden_origin", "Origem não permitida.");

    try {
      if (action === "login") return await login(request, config);
      if (action === "logout") return await logout(request, config);
      return await edit(request, config, action === "save" ? "save" : "undo");
    } catch {
      return error(502, "central_unavailable", "Serviço de textos indisponível. Tente novamente.");
    }
  }

  async function GET(): Promise<Response> {
    return error(404, "not_found", "Rota não encontrada.");
  }

  return { GET, POST };
}
