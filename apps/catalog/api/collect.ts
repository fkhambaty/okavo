/**
 * Analytics collector.
 *
 * Runs on Vercel's edge so it can read the visitor's location from the
 * request headers, then writes one row per page view through the Worker.
 * The browser never touches the analytics table. A missing ingest secret
 * returns 503 instead of a silent 204.
 *
 * The raw IP address is never stored. It is folded into a daily salted hash
 * that lets us count unique people without being able to identify one, and
 * that hash changes every day.
 */

import { analyticsReadiness } from "./analytics-readiness.mjs";

export const config = { runtime: "edge" };

type Beacon = {
  path?: string;
  query?: string;
  referrer?: string;
  screenWidth?: number;
  language?: string;
  timezone?: string;
  sessionId?: string;
  isNewVisitor?: boolean;
  profileId?: string | null;
};

function responseHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const configured = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = new Set([
    "https://okavo.org",
    "https://www.okavo.org",
    "http://127.0.0.1:5180",
    "http://localhost:5180",
    ...configured,
  ]);
  return {
    ...(origin && allowed.has(origin)
      ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
      : {}),
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

/** Search engines and AI assistants we want to see broken out by name. */
const SEARCH_HOSTS = [
  "google.",
  "bing.",
  "duckduckgo.",
  "yahoo.",
  "ecosia.",
  "brave.",
  "yandex.",
  "baidu.",
];

const SOCIAL_HOSTS = [
  "linkedin.",
  "lnkd.in",
  "twitter.",
  "x.com",
  "t.co",
  "facebook.",
  "fb.com",
  "instagram.",
  "reddit.",
  "news.ycombinator.com",
  "producthunt.",
  "youtube.",
  "youtu.be",
  "tiktok.",
  "threads.",
  "whatsapp.",
  "t.me",
  "telegram.",
  "medium.",
  "substack.",
  "quora.",
  "discord.",
  "slack.",
];

const AI_HOSTS = ["chatgpt.", "chat.openai.", "perplexity.", "claude.", "gemini.", "copilot."];

function classify(referrerHost: string | null, utmMedium: string | null): string {
  const medium = (utmMedium ?? "").toLowerCase();
  if (medium) {
    if (["cpc", "ppc", "paid", "paid_social", "display"].includes(medium)) return "paid";
    if (["email", "newsletter"].includes(medium)) return "email";
    if (["social", "social_media"].includes(medium)) return "social";
    if (medium === "referral") return "referral";
    if (medium === "organic") return "organic search";
  }

  if (!referrerHost) return "direct";
  const host = referrerHost.toLowerCase();
  if (AI_HOSTS.some((h) => host.includes(h))) return "ai assistant";
  if (SEARCH_HOSTS.some((h) => host.includes(h))) return "organic search";
  if (SOCIAL_HOSTS.some((h) => host.includes(h))) return "social";
  return "referral";
}

/** Coarse device class. Precise enough to act on, cheap to compute. */
function readUserAgent(ua: string) {
  const value = ua.toLowerCase();

  const device = /ipad|tablet|playbook|silk/.test(value)
    ? "Tablet"
    : /mobi|iphone|android|phone|ipod/.test(value)
      ? "Mobile"
      : /bot|crawl|spider|slurp|headless/.test(value)
        ? "Bot"
        : "Desktop";

  const os = /windows nt/.test(value)
    ? "Windows"
    : /iphone|ipad|ipod/.test(value)
      ? "iOS"
      : /mac os x/.test(value)
        ? "macOS"
        : /android/.test(value)
          ? "Android"
          : /linux/.test(value)
            ? "Linux"
            : "Other";

  // Order matters: Edge and Chrome both claim Safari, Edge claims Chrome.
  const browser = /edg\//.test(value)
    ? "Edge"
    : /opr\/|opera/.test(value)
      ? "Opera"
      : /chrome\/|crios/.test(value)
        ? "Chrome"
        : /firefox|fxios/.test(value)
          ? "Firefox"
          : /safari/.test(value)
            ? "Safari"
            : "Other";

  return { device, os, browser };
}

async function dailyVisitorId(ip: string, ua: string, salt: string) {
  const day = new Date().toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`${salt}:${day}:${ip}:${ua}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function decodeHeader(value: string | null): string | null {
  if (!value) return null;
  try {
    // Vercel percent-encodes city names with non-ASCII characters.
    return decodeURIComponent(value) || null;
  } catch {
    return value;
  }
}

export default async function handler(req: Request): Promise<Response> {
  const headers = responseHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers });
  }

  const apiUrl = process.env.OKAVO_API_URL ?? process.env.VITE_OKAVO_API_URL;
  const ingestSecret = process.env.ANALYTICS_INGEST_SECRET;
  const readiness = analyticsReadiness({ apiUrl, ingestSecret });
  if (!readiness.ok) {
    return new Response(
      JSON.stringify({ error: "analytics_misconfigured", missing: readiness.missing }),
      { status: 503, headers: { ...headers, "content-type": "application/json" } },
    );
  }

  let beacon: Beacon;
  try {
    beacon = (await req.json()) as Beacon;
  } catch {
    return new Response(null, { status: 204, headers });
  }

  const ua = req.headers.get("user-agent") ?? "";
  const { device, os, browser } = readUserAgent(ua);
  if (device === "Bot") return new Response(null, { status: 204, headers });

  const ip =
    req.headers.get("x-real-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ??
    "unknown";

  const visitorId = await dailyVisitorId(
    ip,
    ua,
    process.env.ANALYTICS_SALT ?? "okavo"
  );

  let referrerHost: string | null = null;
  if (beacon.referrer) {
    try {
      const url = new URL(beacon.referrer);
      // Navigation inside the site is not a referral.
      const self = req.headers.get("host") ?? "";
      referrerHost = url.hostname === self ? null : url.hostname.replace(/^www\./, "");
    } catch {
      referrerHost = null;
    }
  }

  const params = new URLSearchParams(beacon.query ?? "");
  const utmSource = params.get("utm_source");
  const utmMedium = params.get("utm_medium");

  const row = {
    visitor_id: visitorId,
    session_id: beacon.sessionId ?? visitorId,
    is_new_visitor: beacon.isNewVisitor ?? true,
    path: (beacon.path ?? "/").slice(0, 300),
    query: (beacon.query ?? "").slice(0, 500) || null,
    referrer_host: referrerHost,
    referrer_url: beacon.referrer ? beacon.referrer.slice(0, 500) : null,
    channel: classify(referrerHost, utmMedium),
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: params.get("utm_campaign"),
    utm_content: params.get("utm_content"),
    utm_term: params.get("utm_term"),
    country: req.headers.get("x-vercel-ip-country"),
    region: req.headers.get("x-vercel-ip-country-region"),
    city: decodeHeader(req.headers.get("x-vercel-ip-city")),
    timezone: beacon.timezone ?? req.headers.get("x-vercel-ip-timezone"),
    device,
    os,
    browser,
    screen_width: Number.isFinite(beacon.screenWidth) ? beacon.screenWidth : null,
    language: (beacon.language ?? "").slice(0, 12) || null,
    profile_id: beacon.profileId ?? null,
  };

  try {
    const upstream = await fetch(`${apiUrl.replace(/\/$/, "")}/v1/analytics/collect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-okavo-ingest": ingestSecret,
      },
      body: JSON.stringify(row),
    });
    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: "analytics_ingest_rejected", status: upstream.status }),
        { status: 502, headers: { ...headers, "content-type": "application/json" } },
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "analytics_ingest_unreachable" }),
      { status: 502, headers: { ...headers, "content-type": "application/json" } },
    );
  }

  return new Response(null, { status: 204, headers });
}
