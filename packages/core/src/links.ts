/** Native routes and the only WebView pages the Okavo app may open. */

export const LEGAL_PAGES = ["terms", "privacy", "security", "guarantee", "how-it-works", "faq", "about"] as const;

export type LegalPage = (typeof LEGAL_PAGES)[number];

const LEGAL_PATHS = new Set<string>(LEGAL_PAGES.map((page) => `/${page}`));

const TOKEN_QUERY = /(?:^|[?&#])(?:access_token|refresh_token|code)=/i;

export type LinkDecision =
  | { kind: "native"; path: string }
  | { kind: "legal"; url: string; page: LegalPage }
  | { kind: "blocked"; reason: string };

function isLegalPage(value: string): value is LegalPage {
  return (LEGAL_PAGES as readonly string[]).includes(value);
}

function blocked(reason: string): LinkDecision {
  return { kind: "blocked", reason };
}

function nativePath(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/signin") return path === "/signin" ? "/sign-in" : "/";
  if (path === "/app") return "/workspace";
  const project = path.match(/^\/app\/project\/([^/]+)$/);
  if (project?.[1]) return `/workspace/projects/${decodeURIComponent(project[1])}`;
  const contract = path.match(/^\/app\/contract\/([^/]+)$/);
  if (contract?.[1]) return `/workspace/contracts/${decodeURIComponent(contract[1])}`;
  const developer = path.match(/^\/app\/developers\/([^/]+)$/);
  if (developer?.[1]) return `/workspace/developers/${decodeURIComponent(developer[1])}`;
  const table: Record<string, string> = {
    "/app/contracts": "/workspace/contracts",
    "/app/messages": "/workspace/messages",
    "/app/notifications": "/workspace/notifications",
    "/app/new": "/workspace/requirements",
    "/app/payments": "/workspace/payments",
    "/app/payments/return": "/workspace/payments",
    "/app/developers": "/workspace/developers",
    "/app/bids": "/workspace/bids",
    "/app/earnings": "/workspace/earnings",
    "/app/verification": "/workspace/verification",
    "/app/verifications": "/workspace/admin/verifications",
    "/app/exams": "/workspace/admin/exams",
    "/app/blocks": "/workspace/admin/blocks",
    "/app/operations": "/workspace/admin/operations",
    "/app/audit": "/workspace/admin/audit",
    "/app/traffic": "/workspace/admin/operations",
  };
  return table[path] ?? null;
}

function legalDecision(url: URL): LinkDecision {
  if (url.username || url.password) return blocked("Links with embedded credentials are blocked.");
  if (TOKEN_QUERY.test(url.search) || TOKEN_QUERY.test(url.hash)) {
    return blocked("Session tokens are never accepted from a link.");
  }
  const page = url.pathname.replace(/^\//, "").replace(/\/$/, "");
  if (!isLegalPage(page)) return blocked("That Okavo page is not available in the in-app browser.");
  return { kind: "legal", url: `https://okavo.org/${page}`, page };
}

/**
 * Classify a deep link or WebView navigation.
 * Native workspace links stay in the app. Legal pages may use a WebView.
 * Every other origin, scheme, and token-bearing URL is blocked.
 */
export function classifyLink(raw: string): LinkDecision {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return blocked("That link could not be read.");
  }
  if (TOKEN_QUERY.test(raw)) return blocked("Session tokens are never accepted from a link.");
  const scheme = url.protocol.replace(":", "");
  if (scheme === "okavo") {
    const path = `/${url.hostname}${url.pathname}`.replace(/\/+/g, "/");
    const native = nativePath(path.startsWith("/app") || path.startsWith("/signin") ? path : path);
    if (!native) return blocked("That Okavo link does not open a screen in the app.");
    return { kind: "native", path: native };
  }
  if (scheme !== "https") return blocked("Only https://okavo.org pages can open in the app.");
  if (url.hostname !== "okavo.org" && url.hostname !== "www.okavo.org") {
    return blocked("Links outside okavo.org stay in the device browser, not inside Okavo.");
  }
  const native = nativePath(url.pathname);
  if (native && (url.pathname === "/signin" || url.pathname.startsWith("/app"))) {
    return { kind: "native", path: native };
  }
  if (LEGAL_PATHS.has(url.pathname.replace(/\/$/, "") || url.pathname)) return legalDecision(url);
  return blocked("That Okavo page is not available in the in-app browser.");
}

export function allowLegalWebView(raw: string): { allow: boolean; reason: string } {
  const decision = classifyLink(raw);
  if (decision.kind === "legal") return { allow: true, reason: "Allowlisted Okavo legal page." };
  if (decision.kind === "native") return { allow: false, reason: "Workspace links open natively." };
  return { allow: false, reason: decision.reason };
}
