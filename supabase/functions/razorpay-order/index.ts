import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  json,
  requireEnv,
  serviceClient,
} from "../_shared/backend.ts";
import { consumeRateLimit, tooManyRequests } from "../_shared/rateLimit.ts";

/**
 * Opens a Razorpay order for one of the platform fees.
 *
 * The amount is decided here and never accepted from the caller: the browser
 * may ask to pay a posting fee, but it may not say what a posting fee costs.
 * The order is recorded as a pending payment; only the webhook marks it paid.
 */

type Purpose = "requirement_posting" | "bidding_membership" | "platform_fee";

const FIXED: Record<
  "requirement_posting" | "bidding_membership",
  { amount: number; label: string }
> = {
  requirement_posting: { amount: 9900, label: "Okavo requirement posting fee ($1)" },
  bidding_membership: { amount: 89900, label: "Okavo bidding membership ($11)" },
};

const CURRENCY = "INR";
/** $1 display ≈ ₹99 charge — same fixed mapping as posting/membership. */
const INR_PAISE_PER_USD = 9900;

function isPurpose(value: unknown): value is Purpose {
  return (
    value === "requirement_posting" ||
    value === "bidding_membership" ||
    value === "platform_fee"
  );
}

async function resolveUser(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Missing bearer token");

  const response = await fetch(`${requireEnv("SUPABASE_URL")}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: requireEnv("SUPABASE_ANON_KEY"),
    },
  });
  if (!response.ok) throw new Error("Not signed in");

  const user = (await response.json()) as { id?: string; email?: string };
  if (!user.id) throw new Error("Not signed in");
  return user as { id: string; email?: string };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" }, req);
  }
  if (Deno.env.get("RAZORPAY_PAYMENTS_ENABLED") !== "true") {
    return json(
      503,
      {
        error:
          "Payments are temporarily unavailable while the payment account is being verified. You have not been charged.",
      },
      req
    );
  }

  let user: { id: string; email?: string };
  try {
    user = await resolveUser(req);
  } catch (error) {
    return json(
      401,
      { error: error instanceof Error ? error.message : "Not signed in" },
      req
    );
  }

  const withinLimit = await consumeRateLimit({
    scope: "razorpay-order",
    actor: user.id,
    limit: 15,
    windowSeconds: 3600,
  });
  if (!withinLimit) {
    return tooManyRequests(
      req,
      3600,
      "Too many checkout attempts. Try again in an hour."
    );
  }

  let payload: { purpose?: unknown; bid_id?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" }, req);
  }

  if (!isPurpose(payload.purpose)) {
    return json(400, { error: "Unknown payment purpose" }, req);
  }
  const purpose = payload.purpose;
  const db = serviceClient();

  try {
    let amount: number;
    let label: string;
    let bidId: string | null = null;
    let projectId: string | null = null;

    if (purpose === "platform_fee") {
      bidId = typeof payload.bid_id === "string" ? payload.bid_id : null;
      if (!bidId) {
        return json(
          400,
          { error: "bid_id is required for the hire success fee" },
          req
        );
      }
      const bids = (await db.select(
        `bids?id=eq.${bidId}&select=id,amount_cents,project_id,status`
      )) as Array<{
        id: string;
        amount_cents: number;
        project_id: string;
        status: string;
      }>;
      const bid = bids[0];
      if (!bid) return json(404, { error: "Bid not found" }, req);
      const projects = (await db.select(
        `projects?id=eq.${bid.project_id}&select=buyer_id`
      )) as Array<{ buyer_id: string }>;
      if (projects[0]?.buyer_id !== user.id) {
        return json(403, { error: "Only the buyer can pay the hire fee" }, req);
      }
      if (bid.status === "awarded") {
        return json(409, { error: "This bid is already awarded" }, req);
      }
      const already = (await db.select(
        `payments?bid_id=eq.${bidId}&purpose=eq.platform_fee&status=eq.paid&select=id`
      )) as unknown[];
      if (already?.length) {
        return json(409, { error: "Hire fee already paid for this bid" }, req);
      }
      // 10% of bid (USD cents → INR paise via fixed $1=₹99 map), minimum ₹99.
      amount = Math.max(
        9900,
        Math.round((bid.amount_cents / 100) * 0.1 * INR_PAISE_PER_USD)
      );
      const usdLabel = Math.max(1, Math.round(bid.amount_cents / 100 / 10));
      label = `Okavo hire success fee (10% ≈ $${usdLabel})`;
      projectId = bid.project_id;
    } else {
      ({ amount, label } = FIXED[purpose]);
    }

    if (purpose === "bidding_membership") {
      const paid = (await db.select(
        `payments?profile_id=eq.${user.id}&purpose=eq.bidding_membership&status=eq.paid&select=id`
      )) as unknown[];
      if (paid?.length) {
        return json(
          409,
          { error: "Bidding is already unlocked on this account" },
          req
        );
      }
    }

    const pendingFilter = [
      `profile_id=eq.${user.id}`,
      `purpose=eq.${purpose}`,
      "status=eq.pending",
      `created_at=gte.${encodeURIComponent(new Date(Date.now() - 15 * 60_000).toISOString())}`,
      bidId ? `bid_id=eq.${bidId}` : "bid_id=is.null",
      "select=id,provider_order_id,amount_cents,currency",
      "order=created_at.desc",
      "limit=1",
    ].join("&");
    const pending = (await db.select(`payments?${pendingFilter}`)) as Array<{
      id: string;
      provider_order_id: string | null;
      amount_cents: number;
      currency: string;
    }>;
    const reusable = pending[0];
    if (reusable?.provider_order_id) {
      return json(
        200,
        {
          orderId: reusable.provider_order_id,
          amount: reusable.amount_cents,
          currency: reusable.currency,
          label,
          paymentId: reusable.id,
          keyId: requireEnv("RAZORPAY_KEY_ID"),
          reused: true,
        },
        req
      );
    }
    if (reusable) {
      return json(
        409,
        {
          error: "A payment order is already being opened. Please retry shortly.",
        },
        req
      );
    }

    const insertRow: Record<string, unknown> = {
      profile_id: user.id,
      purpose,
      status: "pending",
      amount_cents: amount,
      currency: CURRENCY,
      provider: "razorpay",
    };
    if (bidId) insertRow.bid_id = bidId;
    if (projectId) insertRow.project_id = projectId;

    const created = (await db.insert("payments", insertRow)) as Array<{
      id: string;
    }>;

    const paymentId = created?.[0]?.id;
    if (!paymentId) throw new Error("Could not open a payment record");

    const auth = btoa(
      `${requireEnv("RAZORPAY_KEY_ID")}:${requireEnv("RAZORPAY_KEY_SECRET")}`
    );

    const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: CURRENCY,
        // Razorpay caps receipts at 40 characters.
        receipt: paymentId.replace(/-/g, "").slice(0, 40),
        notes: { payment_id: paymentId, purpose, profile_id: user.id },
      }),
    });

    const order = (await orderResponse.json()) as Record<string, any>;
    if (!orderResponse.ok || !order.id) {
      const message = order?.error?.description ?? "Razorpay rejected the order";
      throw new Error(message);
    }

    await db.update(`payments?id=eq.${paymentId}`, {
      provider_order_id: String(order.id),
      provider_reference: String(order.id),
    });

    return json(
      200,
      {
        orderId: order.id,
        amount,
        currency: CURRENCY,
        label,
        paymentId,
        keyId: requireEnv("RAZORPAY_KEY_ID"),
      },
      req
    );
  } catch (error) {
    console.error("razorpay-order failed");
    return json(500, { error: "Could not open checkout" }, req);
  }
});
