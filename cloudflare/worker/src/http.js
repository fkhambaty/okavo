export const ALLOWED_ORIGINS = new Set([
  "https://okavo.org",
  "https://www.okavo.org",
  "http://127.0.0.1:5180",
  "http://localhost:5180",
]);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function fileResponse(bytes, mime, origin) {
  const headers = {
    "content-type": mime || "application/octet-stream",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
  };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] = "authorization, content-type, x-okavo-ingest, x-okavo-ops, x-okavo-client-ip";
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers.vary = "Origin";
  }
  return new Response(bytes, { status: 200, headers });
}

export function json(body, status, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] = "authorization, content-type, x-okavo-ingest, x-okavo-ops, x-okavo-client-ip";
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers.vary = "Origin";
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

export function allowedOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return "";
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function clientIp(request) {
  return (
    request.headers.get("x-okavo-client-ip") ||
    request.headers.get("cf-connecting-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

export function clampText(value, max) {
  return String(value ?? "").trim().slice(0, max);
}
