import { consumeRateLimit } from "./auth.js";
import { HttpError } from "./http.js";
import { hmacHex, hireFeePaise, nowIso, paymentsLive, sha256, timingSafeEqual, fixedFee, CHARGE_CURRENCY } from "./pure.js";

const NOT_CHARGED =
  "Payments are temporarily unavailable while the payment account is being verified. You have not been charged.";

function requireUser(user) {
  if (!user) throw new HttpError(401, "Sign in again to continue to payment.");
}

async function ops(db, summary, entityId, detail) {
  await db
    .prepare(
      `INSERT INTO ops_events (id, severity, category, code, summary, entity_type, entity_id, detail, created_at)
       VALUES (?, 'critical', 'payments', 'provider_amount_mismatch', ?, 'payment', ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), summary, entityId, JSON.stringify(detail), nowIso())
    .run();
}

export async function settlePayment(db, input) {
  const row = await db.prepare("SELECT * FROM payments WHERE id = ?").bind(input.paymentId).first();
  if (!row) return "unknown";
  if (row.status === "paid") {
    if (row.provider_payment_id && row.provider_payment_id !== input.providerPaymentId) {
      throw new HttpError(409, "Payment already settled with a different provider payment");
    }
    return "already_paid";
  }
  if (row.status !== "pending") throw new HttpError(409, "Payment is not pending");
  if (row.provider !== input.provider) throw new HttpError(400, "Payment provider mismatch");
  if (row.provider_order_id !== input.orderId) throw new HttpError(400, "Payment order mismatch");
  if (Number(row.amount_cents) !== Number(input.amountCents) || String(row.currency).toUpperCase() !== String(input.currency).toUpperCase()) {
    await ops(db, "Provider payment amount or currency did not match the order", row.id, {
      expected_amount: row.amount_cents,
      received_amount: input.amountCents,
      expected_currency: row.currency,
      received_currency: String(input.currency).toUpperCase(),
    });
    return "mismatch";
  }
  const now = nowIso();
  await db
    .prepare(
      `UPDATE payments
          SET status = 'paid', paid_at = COALESCE(paid_at, ?), provider_payment_id = ?,
              provider_reference = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'`,
    )
    .bind(now, input.providerPaymentId, input.providerPaymentId, now, row.id)
    .run();
  if (row.purpose === "bidding_membership") {
    await db
      .prepare(
        `UPDATE developer_profiles
            SET bidding_unlocked_at = COALESCE(bidding_unlocked_at, ?), updated_at = ?
          WHERE profile_id = ?`,
      )
      .bind(now, now, row.profile_id)
      .run();
  }
  return "settled";
}

export async function createOrder(db, env, request, user, body) {
  requireUser(user);
  if (!paymentsLive(env)) throw new HttpError(503, NOT_CHARGED);
  const allowed = await consumeRateLimit(db, await sha256(`razorpay-order:${user.id}`), 15, 3600);
  if (!allowed) throw new HttpError(429, "Too many checkout attempts. Try again in an hour.");

  const purpose = body?.purpose;
  if (purpose !== "requirement_posting" && purpose !== "bidding_membership" && purpose !== "platform_fee") {
    throw new HttpError(400, "Unknown payment purpose");
  }

  let amount;
  let label;
  let bidId = null;
  let projectId = null;
  if (purpose === "platform_fee") {
    bidId = typeof body?.bid_id === "string" ? body.bid_id : "";
    if (!bidId) throw new HttpError(400, "bid_id is required for the hire success fee");
    const bid = await db
      .prepare("SELECT id, amount_cents, project_id, status FROM bids WHERE id = ?")
      .bind(bidId)
      .first();
    if (!bid) throw new HttpError(404, "Bid not found");
    const project = await db.prepare("SELECT buyer_id FROM projects WHERE id = ?").bind(bid.project_id).first();
    if (project?.buyer_id !== user.id) throw new HttpError(403, "Only the buyer can pay the hire fee");
    if (bid.status === "awarded") throw new HttpError(409, "This bid is already awarded");
    const already = await db
      .prepare("SELECT id FROM payments WHERE bid_id = ? AND purpose = 'platform_fee' AND status = 'paid'")
      .bind(bidId)
      .first();
    if (already) throw new HttpError(409, "Hire fee already paid for this bid");
    amount = hireFeePaise(bid.amount_cents);
    const usdLabel = Math.max(1, Math.round(bid.amount_cents / 100 / 10));
    label = `Okavo hire success fee (10% ≈ $${usdLabel})`;
    projectId = bid.project_id;
  } else {
    if (user.role !== "buyer" && purpose === "requirement_posting") {
      throw new HttpError(403, "Only a buyer can pay a posting fee");
    }
    if (user.role !== "developer" && purpose === "bidding_membership") {
      throw new HttpError(403, "Only a developer can pay the bidding membership");
    }
    ({ amount, label } = fixedFee(purpose));
    if (purpose === "bidding_membership") {
      const paid = await db
        .prepare("SELECT id FROM payments WHERE profile_id = ? AND purpose = 'bidding_membership' AND status = 'paid'")
        .bind(user.id)
        .first();
      if (paid) throw new HttpError(409, "Bidding is already unlocked on this account");
    }
  }

  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const reusable = await db
    .prepare(
      `SELECT id, provider_order_id, amount_cents, currency FROM payments
        WHERE profile_id = ? AND purpose = ? AND status = 'pending' AND created_at >= ?
          AND ((? IS NULL AND bid_id IS NULL) OR bid_id = ?)
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(user.id, purpose, since, bidId, bidId)
    .first();
  if (reusable?.provider_order_id) {
    return {
      orderId: reusable.provider_order_id,
      amount: reusable.amount_cents,
      currency: reusable.currency,
      label,
      paymentId: reusable.id,
      keyId: env.RAZORPAY_KEY_ID,
      reused: true,
    };
  }

  const paymentId = crypto.randomUUID();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO payments (
         id, profile_id, purpose, status, amount_cents, currency, provider,
         project_id, bid_id, created_at, updated_at
       ) VALUES (?, ?, ?, 'pending', ?, ?, 'razorpay', ?, ?, ?, ?)`,
    )
    .bind(paymentId, user.id, purpose, amount, CHARGE_CURRENCY, projectId, bidId, now, now)
    .run();

  const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount,
      currency: CHARGE_CURRENCY,
      receipt: paymentId,
      notes: { payment_id: paymentId, purpose },
    }),
  });
  const orderBody = await orderResponse.json().catch(() => ({}));
  if (!orderResponse.ok || !orderBody.id) {
    await db.prepare("DELETE FROM payments WHERE id = ? AND provider_order_id IS NULL").bind(paymentId).run();
    throw new HttpError(502, "Payment could not be started. You have not been charged.");
  }
  await db
    .prepare("UPDATE payments SET provider_order_id = ?, updated_at = ? WHERE id = ?")
    .bind(orderBody.id, nowIso(), paymentId)
    .run();
  return {
    orderId: orderBody.id,
    amount,
    currency: CHARGE_CURRENCY,
    label,
    paymentId,
    keyId: env.RAZORPAY_KEY_ID,
  };
}

export async function confirmOrder(db, env, user, body) {
  requireUser(user);
  if (!env.RAZORPAY_KEY_SECRET) throw new HttpError(503, NOT_CHARGED);
  const allowed = await consumeRateLimit(db, await sha256(`razorpay-confirm:${user.id}`), 30, 3600);
  if (!allowed) throw new HttpError(429, "Too many payment confirmations. Try again in an hour.");

  const paymentId = String(body?.payment_id || "").trim();
  const orderId = String(body?.razorpay_order_id || "").trim();
  const razorpayPaymentId = String(body?.razorpay_payment_id || "").trim();
  const signature = String(body?.razorpay_signature || "").trim();
  if (!paymentId || !orderId || !razorpayPaymentId || !signature) {
    throw new HttpError(400, "payment_id, razorpay_order_id, razorpay_payment_id, and razorpay_signature are required");
  }
  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${razorpayPaymentId}`);
  if (!timingSafeEqual(expected, signature)) throw new HttpError(400, "Invalid payment signature");

  const record = await db.prepare("SELECT * FROM payments WHERE id = ?").bind(paymentId).first();
  if (!record) throw new HttpError(404, "Payment not found");
  if (record.profile_id !== user.id) throw new HttpError(403, "This payment does not belong to you");
  if (record.provider !== "razorpay") throw new HttpError(400, "Not a Razorpay payment");
  if (record.provider_order_id !== orderId) throw new HttpError(400, "Order does not match this payment");
  if (record.status === "paid") return { ok: true, alreadyPaid: true };
  if (!paymentsLive(env)) throw new HttpError(503, NOT_CHARGED);

  const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const remoteResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpayPaymentId)}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const remote = await remoteResponse.json().catch(() => ({}));
  if (!remoteResponse.ok) throw new HttpError(502, "Could not confirm the payment with Razorpay. You should not pay again until support checks this order.");
  if (String(remote.order_id || "") !== orderId) throw new HttpError(400, "Razorpay order mismatch");
  if (String(remote.status || "") !== "captured") {
    throw new HttpError(409, `Payment is ${remote.status || "unknown"}, not captured`);
  }
  const result = await settlePayment(db, {
    paymentId,
    provider: "razorpay",
    orderId,
    providerPaymentId: razorpayPaymentId,
    amountCents: Number(remote.amount),
    currency: String(remote.currency || ""),
  });
  if (result === "mismatch") throw new HttpError(409, "Payment amount did not match the order. You have not been marked paid.");
  return { ok: result === "settled" || result === "already_paid", alreadyPaid: result === "already_paid" };
}

export async function webhook(db, env, request, raw) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) throw new HttpError(500, "Webhook is not configured");
  const expected = await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw);
  if (!timingSafeEqual(expected, request.headers.get("x-razorpay-signature") || "")) {
    throw new HttpError(400, "Invalid signature");
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  const type = String(event.event || "unknown");
  const payment = event.payload?.payment?.entity;
  const order = event.payload?.order?.entity;
  const providerPaymentId = payment?.id ? String(payment.id) : null;
  const orderId = payment?.order_id ? String(payment.order_id) : order?.id ? String(order.id) : null;
  const eventId = typeof event.id === "string" ? event.id : `${type}:${providerPaymentId || orderId || (await sha256(raw))}`;
  const seen = await db
    .prepare("SELECT id FROM payment_provider_events WHERE provider = 'razorpay' AND provider_event_id = ?")
    .bind(eventId)
    .first();
  if (seen) return { received: true, duplicate: true };

  const ledgerId = crypto.randomUUID();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO payment_provider_events (
         id, provider, provider_event_id, event_type, provider_order_id, provider_payment_id, status, detail, received_at
       ) VALUES (?, 'razorpay', ?, ?, ?, ?, 'received', ?, ?)`,
    )
    .bind(ledgerId, eventId, type, orderId, providerPaymentId, JSON.stringify({ type }).slice(0, 2000), now)
    .run();

  const ignore = async (status) => {
    await db
      .prepare("UPDATE payment_provider_events SET status = ?, processed_at = ? WHERE id = ?")
      .bind(status, nowIso(), ledgerId)
      .run();
  };

  if (!paymentsLive(env) || type !== "payment.captured" || !orderId || !providerPaymentId || !payment) {
    await ignore("ignored");
    return { received: true, settled: false };
  }
  const notes = payment.notes || {};
  const local = notes.payment_id
    ? await db.prepare("SELECT * FROM payments WHERE id = ?").bind(String(notes.payment_id)).first()
    : await db.prepare("SELECT * FROM payments WHERE provider_order_id = ?").bind(orderId).first();
  if (!local) {
    await ignore("ignored");
    return { received: true, note: "Unknown payment" };
  }
  const result = await settlePayment(db, {
    paymentId: local.id,
    provider: "razorpay",
    orderId,
    providerPaymentId,
    amountCents: Number(payment.amount),
    currency: String(payment.currency || ""),
  });
  await db
    .prepare("UPDATE payment_provider_events SET payment_id = ?, status = ?, processed_at = ? WHERE id = ?")
    .bind(local.id, result === "mismatch" ? "failed" : "processed", nowIso(), ledgerId)
    .run();
  return { received: true, result };
}

export async function paymentStatus(db, user, paymentId) {
  requireUser(user);
  const row = await db
    .prepare("SELECT id, status FROM payments WHERE id = ? AND profile_id = ?")
    .bind(paymentId, user.id)
    .first();
  if (!row) throw new HttpError(404, "Payment not found");
  return { id: row.id, status: row.status };
}
