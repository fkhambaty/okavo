/**
 * Decides whether the analytics collector can store a page view.
 * Returns missing setting names only. Never returns a secret value.
 */
export function analyticsReadiness({ apiUrl, ingestSecret } = {}) {
  const missing = [];
  if (!apiUrl) missing.push("OKAVO_API_URL");
  if (typeof ingestSecret !== "string" || ingestSecret.length < 16) {
    missing.push("ANALYTICS_INGEST_SECRET");
  }
  return { ok: missing.length === 0, missing };
}
