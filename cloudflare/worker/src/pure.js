export const POSTING_FEE_PAISE = 9900;
export const MEMBERSHIP_FEE_PAISE = 89900;
export const INR_PAISE_PER_USD = 9900;
export const CHARGE_CURRENCY = "INR";

const FIXED = {
  requirement_posting: { amount: POSTING_FEE_PAISE, label: "Okavo requirement posting fee ($1)" },
  bidding_membership: { amount: MEMBERSHIP_FEE_PAISE, label: "Okavo bidding membership ($11)" },
};

export function fixedFee(purpose) {
  return FIXED[purpose] ?? null;
}

/** Server-owned 10% hire fee. The browser never supplies this amount. */
export function hireFeePaise(bidUsdCents) {
  const cents = Number(bidUsdCents);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return Math.max(POSTING_FEE_PAISE, Math.round((cents / 100) * 0.1 * INR_PAISE_PER_USD));
}

export function paymentsLive(env) {
  const keyId = env?.RAZORPAY_KEY_ID;
  const secret = env?.RAZORPAY_KEY_SECRET;
  return (
    env?.RAZORPAY_PAYMENTS_ENABLED === "true" &&
    typeof keyId === "string" &&
    keyId.startsWith("rzp_") &&
    typeof secret === "string" &&
    secret.length > 0
  );
}

export function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export function timingSafeEqual(left, right) {
  const a = String(left);
  const b = String(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToHex(new Uint8Array(signed));
}

export function newCode() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(value).padStart(6, "0");
}

export function nowIso() {
  return new Date().toISOString();
}

export function lockReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return `LOCK-${bytesToHex(bytes).toUpperCase()}`;
}

/** Owner accounts promoted to admin on signup, verify, and login. */
export const OWNER_EMAILS = ["fakhruddinkhambaty@gmail.com", "fktiindia@gmail.com"];

export function ownerEmailSet(env) {
  const set = new Set(OWNER_EMAILS);
  for (const value of String(env?.ADMIN_EMAILS || "").split(",")) {
    const email = value.trim().toLowerCase();
    if (email.includes("@")) set.add(email);
  }
  return set;
}

/** Hosted Payment Links until okavo.org is approved for Standard Checkout. */
export function checkoutMode(env) {
  return String(env?.CHECKOUT_MODE || "hosted").trim().toLowerCase() === "modal" ? "modal" : "hosted";
}

export function paymentLinkSignatureMessage({ linkId, referenceId, status, paymentId }) {
  return `${linkId}|${referenceId}|${status}|${paymentId}`;
}

export const FILE_MAX_BYTES = 5 * 1024 * 1024;
export const FILE_CHUNK_CHARS = 512 * 1024;
export const IDENTITY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function chunkText(value, size = FILE_CHUNK_CHARS) {
  const chunks = [];
  for (let index = 0; index < value.length; index += size) chunks.push(value.slice(index, index + size));
  return chunks;
}

export function base64ByteLength(clean) {
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export function decodeBase64(clean) {
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function sniffMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "application/pdf";
  }
  return null;
}

export function normalizeUploadMime(mime) {
  const value = String(mime || "").toLowerCase().split(";")[0].trim();
  if (value === "image/jpg" || value === "image/pjpeg") return "image/jpeg";
  if (value === "image/jpeg" || value === "image/png" || value === "image/webp" || value === "application/pdf") return value;
  return null;
}

export function normalizeExamRepoUrl(value) {
  let text = String(value || "").trim().toLowerCase();
  text = text.replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/\.git$/, "");
  text = text.replace(/^https:\/\/www\.github\.com\//, "https://github.com/");
  text = text.replace(/^https:\/\/www\.gitlab\.com\//, "https://gitlab.com/");
  if (text.startsWith("https://github.com/")) {
    const match = text.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)/);
    text = match ? match[1] : text;
  } else {
    text = text.replace(/\/-\/.*$/, "");
  }
  text = text.replace(/\.git$/, "");
  return text || null;
}

export function examGithubOk(url) {
  return /^https:\/\/(www\.)?(github\.com|gitlab\.com)\/[^/?#]+\/[^/?#]+/i.test(String(url || "").trim());
}

export function examLiveHostOk(url) {
  try {
    const host = new URL(String(url || "").trim()).hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

export function examHeuristicScore({ githubOk, liveOk, repoOk, hostedOk, duplicate }) {
  const checks = [
    {
      id: "github_url",
      pass: Boolean(githubOk),
      detail: githubOk ? "GitHub/GitLab URL shape looks valid" : "Need a public GitHub or GitLab repo URL",
    },
    {
      id: "live_reachable",
      pass: Boolean(liveOk),
      detail: liveOk ? "Live URL responded" : "Live URL did not respond OK within timeout",
    },
    {
      id: "repo_reachable",
      pass: Boolean(repoOk),
      detail: repoOk ? "Repo page responded" : "Repo URL not reachable (private repos fail this check)",
    },
    {
      id: "repo_duplicate",
      pass: !duplicate,
      detail: duplicate
        ? "This normalized repository also appears on another exam. Review it manually; forks are not rejected automatically."
        : "No matching normalized repository was found",
    },
    {
      id: "hosted_not_localhost",
      pass: Boolean(hostedOk),
      detail: hostedOk ? "Live host looks publicly deployable" : "Live URL should be a public deploy, not localhost",
    },
  ];
  const scorable = checks.filter((check) => check.id !== "repo_duplicate");
  const passed = scorable.filter((check) => check.pass).length;
  const overall = scorable.length ? Math.round((passed / scorable.length) * 100) : 0;
  return { overall, checks };
}

/** A secret is configured only when it is present and long enough to be a real value. The value itself is never returned. */
export function secretConfigured(value) {
  return typeof value === "string" && value.length >= 16;
}

export function analyticsIngestStatus(env, header) {
  if (!secretConfigured(env?.ANALYTICS_INGEST_SECRET)) return "misconfigured";
  if (!timingSafeEqual(String(header || ""), env.ANALYTICS_INGEST_SECRET)) return "rejected";
  return "ok";
}

export function opsAuthStatus(env, header) {
  if (!secretConfigured(env?.OPS_CRON_SECRET)) return "misconfigured";
  if (!timingSafeEqual(String(header || ""), env.OPS_CRON_SECRET)) return "rejected";
  return "ok";
}

/** R2 is live only when the Worker binding can actually store an object. */
export function r2Enabled(env) {
  return typeof env?.FILES?.put === "function" && typeof env?.FILES?.get === "function";
}

export function storageBackend(env) {
  return r2Enabled(env) ? "r2" : "d1";
}

export function mailConfigured(env) {
  return secretConfigured(env?.RESEND_API_KEY) && typeof env?.MAIL_FROM === "string" && env.MAIL_FROM.includes("@");
}

export const REVIEW_SLA = {
  identity: "A person reviews government ID. Identity is never approved by a score.",
  exam: "A score of 70 or higher may auto-approve 48 hours after submission unless an admin paused auto-approval or placed a hold. Any lower or missing score waits for a person. Duplicate repositories are flagged for that person and are not rejected automatically.",
  identityFileRetentionDays: 90,
};

export function publicHttpsUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return null;
  }
  if (host === "metadata.google.internal" || host === "169.254.169.254") return null;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return null;
    const [a, b] = parts;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return null;
    }
  }
  if (host.includes(":")) return null;
  return url;
}
