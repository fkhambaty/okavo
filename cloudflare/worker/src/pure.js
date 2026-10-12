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
