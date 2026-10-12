const REFRESH_COOKIE = "okavo-refresh";
const COOKIE_PATH = "/";
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export type PublicSession = {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  user: Record<string, unknown>;
};

type WorkerSession = PublicSession & {
  refresh_token: string;
};

function isLocalRequest(request: Request): boolean {
  const host = request.headers.get("host") ?? "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

export function workerUrl(): string {
  const value = process.env.OKAVO_API_URL ?? process.env.VITE_OKAVO_API_URL;
  if (!value) throw new Error("Missing OKAVO_API_URL");
  return value.replace(/\/$/, "");
}

export function parseCookies(request: Request): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) result.set(name, decodeURIComponent(value));
  }
  return result;
}

function cookie(request: Request, name: string, value: string, maxAge: number): string {
  const secure = isLocalRequest(request) ? "" : "; Secure";
  return `${name}=${encodeURIComponent(value)}; Path=${COOKIE_PATH}; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAge}`;
}

export function refreshCookie(request: Request, token: string): string {
  return cookie(request, REFRESH_COOKIE, token, REFRESH_MAX_AGE);
}

export function clearRefreshCookie(request: Request): string {
  return cookie(request, REFRESH_COOKIE, "", 0);
}

export function refreshToken(request: Request): string | null {
  return parseCookies(request).get(REFRESH_COOKIE) ?? null;
}

export function publicSession(session: WorkerSession): PublicSession {
  return {
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at:
      session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    user: session.user,
  };
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function workerPost(
  path: string,
  body: Record<string, unknown>,
  request?: Request
): Promise<{ response: Response; payload: Record<string, unknown> }> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (request) headers.set("x-okavo-client-ip", clientIp(request));
  const response = await fetch(`${workerUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { response, payload };
}

export function upstreamError(response: Response, body: Record<string, unknown>): Response {
  const message =
    (typeof body.error === "string" && body.error) ||
    "Authentication request failed.";
  return json({ error: message }, { status: response.status });
}

export function assertCookieMutation(request: Request): Response | null {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, { status: 405 });
  }

  const origin = request.headers.get("origin");
  const csrf = request.headers.get("x-okavo-csrf");
  if (!origin || csrf !== "1") {
    return json({ error: "Invalid request origin." }, { status: 403 });
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProtocol =
    request.headers.get("x-forwarded-proto") ??
    (isLocalRequest(request) ? "http" : "https");
  const expectedOrigin = forwardedHost
    ? `${forwardedProtocol}://${forwardedHost}`
    : null;
  const allowed = (process.env.AUTH_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (origin !== expectedOrigin && !allowed.includes(origin)) {
    return json({ error: "Invalid request origin." }, { status: 403 });
  }
  return null;
}

export function sessionResponse(
  request: Request,
  payload: Record<string, unknown>
): Response {
  const session = payload as WorkerSession;
  return json(
    { session: publicSession(session) },
    { headers: { "Set-Cookie": refreshCookie(request, session.refresh_token) } }
  );
}
