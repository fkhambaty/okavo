/**
 * Client half of the analytics beacon.
 *
 * Sends one small POST per page view. Everything identifying — location,
 * device, the visitor hash — is derived server side; this file deliberately
 * knows nothing about who the visitor is beyond their own browser settings.
 */

const SESSION_KEY = "okavo.analytics.session";
const SEEN_KEY = "okavo.analytics.seen";

/** A session is a visit; it expires after 30 minutes of inactivity. */
function sessionId(): string {
  const now = Date.now();
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; at: number };
      if (now - parsed.at < 30 * 60 * 1000) {
        sessionStorage.setItem(
          SESSION_KEY,
          JSON.stringify({ id: parsed.id, at: now })
        );
        return parsed.id;
      }
    }
  } catch {
    // Private mode or blocked storage: fall through to a fresh id.
  }

  const id = `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, at: now }));
  } catch {
    // Not fatal — the visit is still counted, just not grouped.
  }
  return id;
}

function isNewVisitor(): boolean {
  try {
    if (localStorage.getItem(SEEN_KEY)) return false;
    localStorage.setItem(SEEN_KEY, "1");
    return true;
  } catch {
    return true;
  }
}

let lastPath: string | null = null;

export function trackPageView(profileId: string | null) {
  if (typeof window === "undefined") return;

  // Local development would otherwise pollute real numbers.
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    return;
  }

  const path = window.location.pathname;
  const key = `${path}${window.location.search}`;
  if (key === lastPath) return;
  lastPath = key;

  const body = JSON.stringify({
    path,
    query: window.location.search.replace(/^\?/, ""),
    referrer: document.referrer || null,
    screenWidth: window.screen?.width ?? null,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sessionId: sessionId(),
    isNewVisitor: isNewVisitor(),
    profileId,
  });

  // keepalive so the beacon survives the user navigating away immediately.
  void fetch("/api/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  })
    .then(async (response) => {
      if (response.status !== 502 && response.status !== 503) return;
      let detail = "";
      try {
        const payload = (await response.json()) as { error?: string; missing?: string[] };
        if (payload.error === "analytics_misconfigured") {
          detail = ` Missing: ${(payload.missing ?? []).join(", ")}.`;
        } else if (payload.error) {
          detail = ` ${payload.error}.`;
        }
      } catch {
        detail = "";
      }
      console.warn(`Okavo analytics is misconfigured.${detail}`);
    })
    .catch(() => {
      // A network failure is not a configuration claim.
    });
}
