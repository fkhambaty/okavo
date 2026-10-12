import { logAudit } from "./audit";
import { apiBase } from "./backend";
import { getAccessToken } from "./sessionClient";

export type CheckoutPurpose =
  | "requirement_posting"
  | "bidding_membership"
  | "platform_fee";

type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = Record<string, unknown>;
type RazorpayInstance = { open: () => void };

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let scriptPromise: Promise<boolean> | null = null;

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      scriptPromise = null;
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Polls our payments row after confirm/webhook. Confirm is primary; this only
 * covers a race where confirm returns before the row is visible to the client.
 */
async function waitForSettlement(paymentId: string, token: string, base: string): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(`${base}/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json()) as { status?: string };
      if (data.status === "paid") return true;
    } catch {
      // Keep polling; the confirmer may still be writing the row.
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
}

async function confirmPayment(
  token: string,
  base: string,
  body: {
    payment_id: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }
): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await fetch(`${base}/v1/payments/razorpay/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      alreadyPaid?: boolean;
    };
    if (!response.ok) {
      return { ok: false, message: payload.error ?? "Could not confirm payment." };
    }
    return { ok: Boolean(payload.ok || payload.alreadyPaid) };
  } catch {
    return { ok: false, message: "Could not reach the payment confirmer." };
  }
}

export type CheckoutResult =
  | { status: "paid" }
  | { status: "cancelled" }
  | { status: "pending" }
  | { status: "error"; message: string };

/**
 * Collects one of the platform fees through Razorpay Checkout.
 *
 * After the card succeeds, the browser sends Razorpay's signed payload to
 * razorpay-confirm. Only a verified signature (plus a live Razorpay status
 * check) marks the fee paid. The webhook is a backup, not the only path.
 */
export async function collectFee(
  purpose: CheckoutPurpose,
  buyer?: { name?: string; email?: string | null },
  options?: { bidId?: string }
): Promise<CheckoutResult> {
  const base = apiBase();
  if (!base) {
    return { status: "error", message: "Payments are unavailable in demo mode." };
  }

  const token = await getAccessToken();
  if (!token) {
    return { status: "error", message: "Sign in again to continue to payment." };
  }

  let order: {
    orderId: string;
    amount: number;
    currency: string;
    label: string;
    paymentId: string;
    keyId: string;
  };

  try {
    const response = await fetch(`${base}/v1/payments/razorpay/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        purpose,
        bid_id: options?.bidId,
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      return {
        status: "error",
        message: body?.error ?? "Payment could not be started.",
      };
    }
    order = body;
  } catch {
    return {
      status: "error",
      message: "Could not reach the payment service. Check your connection.",
    };
  }

  const ready = await loadCheckout();
  if (!ready || !window.Razorpay) {
    return {
      status: "error",
      message:
        "The payment window could not load. Disable any ad blocker for this site and try again.",
    };
  }

  return new Promise<CheckoutResult>((resolve) => {
    let settled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: CheckoutResult) => {
      if (settled) return;
      settled = true;
      if (watchdog) clearTimeout(watchdog);
      if (result.status === "paid") {
        logAudit(
          purpose === "requirement_posting"
            ? "payment.posting_fee"
            : purpose === "bidding_membership"
              ? "payment.membership_fee"
              : "payment.hire_success_fee",
          "payment",
          order.paymentId,
          { purpose, bidId: options?.bidId }
        );
      }
      resolve(result);
    };

    const checkout = new window.Razorpay!({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: "Okavo",
      description: order.label,
      prefill: {
        name: buyer?.name ?? "",
        email: buyer?.email ?? "",
      },
      theme: { color: "#e8973a" },
      handler: (response: RazorpaySuccessResponse) => {
        void (async () => {
          const confirmed = await confirmPayment(token, base, {
            payment_id: order.paymentId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });

          if (confirmed.ok) {
            const paid = await waitForSettlement(order.paymentId, token, base);
            finish(paid || confirmed.ok ? { status: "paid" } : { status: "pending" });
            return;
          }

          // Webhook may still settle; wait briefly before reporting pending.
          const paid = await waitForSettlement(order.paymentId, token, base);
          if (paid) {
            finish({ status: "paid" });
            return;
          }

          finish({
            status: "error",
            message:
              confirmed.message ??
              "Payment was taken but could not be confirmed. Contact support@okavo.org with your order id — do not pay again.",
          });
        })();
      },
      modal: {
        ondismiss: () => finish({ status: "cancelled" }),
      },
    });

    checkout.open();

    // Razorpay only calls handler/ondismiss once its modal renders. If the
    // iframe is blocked (CSP, extension, network), neither ever fires and the
    // caller would wait forever, so surface an actionable error instead.
    watchdog = setTimeout(() => {
      if (document.querySelector(".razorpay-container")) return;
      finish({
        status: "error",
        message:
          "The payment window could not open. Disable any ad/script blocker for okavo.org and try again — you have not been charged.",
      });
    }, 6000);
  });
}
