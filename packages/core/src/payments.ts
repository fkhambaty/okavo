/**
 * Okavo checkout is switched off until a marketplace merchant approves
 * okavo.org. The app must not invent a Razorpay order, key, or success.
 */

export const PAYMENTS_ENABLED = false;

export const PAYMENTS_DISABLED_COPY =
  "Okavo checkout is switched off. A separate marketplace merchant has not approved okavo.org, so this app does not start a payment and does not contact Razorpay.";

export type PaymentQuote = {
  purpose: string;
  amount: number;
  currency: string;
  label: string;
  checkout?: string;
  charge: boolean;
  paymentsConfigured?: boolean;
  note?: string;
};

export type CheckoutDecision = {
  enabled: false;
  reason: string;
};

/** Always disabled. A quote with charge:true is still refused. */
export function checkoutDecision(_quote?: PaymentQuote | null): CheckoutDecision {
  return { enabled: false, reason: PAYMENTS_DISABLED_COPY };
}

export function assertQuoteIsDisplayOnly(quote: PaymentQuote): PaymentQuote {
  if (quote.charge !== false) {
    throw new Error("Refusing a quote that would create a charge.");
  }
  return quote;
}
