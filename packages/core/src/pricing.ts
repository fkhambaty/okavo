/**
 * Platform fee prices — one place for display and for what Razorpay charges.
 *
 * Display currency is USD everywhere on the site.
 *
 * Charge currency stays INR on Razorpay until Stripe Connect (USD) is approved.
 * Indian Razorpay merchant accounts cannot reliably take USD without
 * International / export enablement; inventing a USD Razorpay charge would
 * break checkout. So the UI shows dollars; the edge function still opens an
 * INR order for the equivalent amounts below.
 *
 * The edge function is the source of truth for the charged amount — the
 * browser never decides what to charge.
 */

export const DISPLAY_CURRENCY = "USD";
export const CHARGE_CURRENCY = "INR";

/** Razorpay charge amounts in paise (INR). Must match razorpay-order CATALOG. */
export const POSTING_FEE_INR_PAISE = 9900; // ₹99
export const MEMBERSHIP_FEE_INR_PAISE = 89900; // ₹899

/**
 * @deprecated Use POSTING_FEE_INR_PAISE. Kept so older call sites that write
 * local/demo payment rows keep the same INR minor units.
 */
export const POSTING_FEE_MINOR = POSTING_FEE_INR_PAISE;
/** @deprecated Use MEMBERSHIP_FEE_INR_PAISE. */
export const MEMBERSHIP_FEE_MINOR = MEMBERSHIP_FEE_INR_PAISE;

/** USD amounts shown in the product (cents). */
export const POSTING_FEE_USD_CENTS = 100; // $1
export const MEMBERSHIP_FEE_USD_CENTS = 1100; // $11

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Formats a USD-cent amount as $1. */
export function feeUsd(cents: number): string {
  return usd.format(cents / 100);
}

/** Formats an INR-paise amount as ₹99 (settlement / admin truth). */
export function feeInr(paise: number): string {
  return inr.format(paise / 100);
}

/** @deprecated Prefer feeUsd — labels on the site are USD. */
export function fee(minorUnits: number): string {
  // Historical callers passed INR paise; map known fee totals to USD labels.
  if (minorUnits === POSTING_FEE_INR_PAISE) return feeUsd(POSTING_FEE_USD_CENTS);
  if (minorUnits === MEMBERSHIP_FEE_INR_PAISE) {
    return feeUsd(MEMBERSHIP_FEE_USD_CENTS);
  }
  if (minorUnits % POSTING_FEE_INR_PAISE === 0) {
    const count = minorUnits / POSTING_FEE_INR_PAISE;
    return feeUsd(count * POSTING_FEE_USD_CENTS);
  }
  return feeUsd(minorUnits);
}

export const POSTING_FEE_LABEL = feeUsd(POSTING_FEE_USD_CENTS);
export const MEMBERSHIP_FEE_LABEL = feeUsd(MEMBERSHIP_FEE_USD_CENTS);

export const POSTING_FEE_INR_LABEL = feeInr(POSTING_FEE_INR_PAISE);
export const MEMBERSHIP_FEE_INR_LABEL = feeInr(MEMBERSHIP_FEE_INR_PAISE);

/** Short note under fee CTAs while Razorpay is the collector. */
export const FEE_SETTLEMENT_HINT =
  `Shown in USD. Until Stripe USD checkout is live, Razorpay collects the INR equivalent (${POSTING_FEE_INR_LABEL} posting / ${MEMBERSHIP_FEE_INR_LABEL} membership).`;

export const POSTING_SETTLEMENT_HINT =
  `Shown as ${POSTING_FEE_LABEL}. Razorpay charges ${POSTING_FEE_INR_LABEL} until Stripe USD is enabled.`;

export const MEMBERSHIP_SETTLEMENT_HINT =
  `Shown as ${MEMBERSHIP_FEE_LABEL}. Razorpay charges ${MEMBERSHIP_FEE_INR_LABEL} until Stripe USD is enabled.`;
