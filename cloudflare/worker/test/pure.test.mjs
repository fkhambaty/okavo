import assert from "node:assert/strict";
import test from "node:test";
import { hireFeePaise, hmacHex, paymentsLive, POSTING_FEE_PAISE, timingSafeEqual } from "../src/pure.js";

test("hire fee is chosen by the server from the bid, with a ₹99 floor", () => {
  assert.equal(hireFeePaise(100), 9900);
  assert.equal(hireFeePaise(200000), 1980000);
  assert.equal(hireFeePaise(0), null);
  assert.equal(hireFeePaise("nope"), null);
});

test("live Razorpay charges stay off unless explicitly enabled with a real key id", () => {
  assert.equal(paymentsLive({}), false);
  assert.equal(paymentsLive({ RAZORPAY_PAYMENTS_ENABLED: "false", RAZORPAY_KEY_ID: "rzp_live_x", RAZORPAY_KEY_SECRET: "secret" }), false);
  assert.equal(paymentsLive({ RAZORPAY_PAYMENTS_ENABLED: "true", RAZORPAY_KEY_ID: "placeholder", RAZORPAY_KEY_SECRET: "secret" }), false);
  assert.equal(paymentsLive({ RAZORPAY_PAYMENTS_ENABLED: "true", RAZORPAY_KEY_ID: "rzp_test_ok", RAZORPAY_KEY_SECRET: "secret" }), true);
});

test("posting fee constant matches the displayed INR charge", () => {
  assert.equal(POSTING_FEE_PAISE, 9900);
});

test("webhook signatures reject a mismatched body", async () => {
  const secret = "test-webhook-secret";
  const body = JSON.stringify({ event: "payment.captured", amount: 1 });
  const good = await hmacHex(secret, body);
  const bad = await hmacHex(secret, `${body} `);
  assert.equal(timingSafeEqual(good, good), true);
  assert.equal(timingSafeEqual(good, bad), false);
  assert.equal(timingSafeEqual(good, ""), false);
});
