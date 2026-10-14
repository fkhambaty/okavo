import assert from "node:assert/strict";
import test from "node:test";
import { clientIp } from "../src/http.js";
import {
  FILE_CHUNK_CHARS,
  FILE_MAX_BYTES,
  base64ByteLength,
  checkoutMode,
  chunkText,
  examHeuristicScore,
  hireFeePaise,
  hmacHex,
  normalizeExamRepoUrl,
  ownerEmailSet,
  paymentLinkSignatureMessage,
  paymentsLive,
  POSTING_FEE_PAISE,
  sniffMime,
  timingSafeEqual,
} from "../src/pure.js";

test("rate limiting trusts Cloudflare's address and ignores caller-supplied aliases", () => {
  const request = new Request("https://api.okavo.org/v1/auth/login", {
    headers: {
      "cf-connecting-ip": "203.0.113.8",
      "x-forwarded-for": "198.51.100.4",
      "x-okavo-client-ip": "192.0.2.5",
    },
  });
  assert.equal(clientIp(request), "203.0.113.8");
});

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

test("owner emails are always admins and hosted checkout is the default", () => {
  const owners = ownerEmailSet({});
  assert.equal(owners.has("fakhruddinkhambaty@gmail.com"), true);
  assert.equal(owners.has("fktiindia@gmail.com"), true);
  assert.equal(owners.has("other@example.com"), false);
  assert.equal(ownerEmailSet({ ADMIN_EMAILS: "extra@example.com" }).has("extra@example.com"), true);
  assert.equal(checkoutMode({}), "hosted");
  assert.equal(checkoutMode({ CHECKOUT_MODE: "modal" }), "modal");
  assert.equal(checkoutMode({ CHECKOUT_MODE: "hosted" }), "hosted");
});

test("payment link signatures use Razorpay's field order", () => {
  assert.equal(
    paymentLinkSignatureMessage({
      linkId: "plink_1",
      referenceId: "pay-1",
      status: "paid",
      paymentId: "pay_1",
    }),
    "plink_1|pay-1|paid|pay_1",
  );
});

test("private files stay within a 5 MB cap and 512 KB chunks", () => {
  assert.equal(FILE_MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(FILE_CHUNK_CHARS, 512 * 1024);
  assert.deepEqual(chunkText("abcdefghij", 4), ["abcd", "efgh", "ij"]);
  assert.equal(base64ByteLength("YQ=="), 1);
  assert.equal(sniffMime(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), "image/jpeg");
  assert.equal(sniffMime(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])), "application/pdf");
  assert.equal(sniffMime(Uint8Array.from([1, 2, 3, 4])), null);
});

test("exam heuristic ignores duplicate as a score and normalizes repos", () => {
  const high = examHeuristicScore({ githubOk: true, liveOk: true, repoOk: true, hostedOk: true, duplicate: true });
  assert.equal(high.overall, 100);
  assert.equal(high.checks.find((check) => check.id === "repo_duplicate").pass, false);
  const low = examHeuristicScore({ githubOk: true, liveOk: false, repoOk: false, hostedOk: true, duplicate: false });
  assert.equal(low.overall, 50);
  assert.equal(normalizeExamRepoUrl("https://www.github.com/Okavo/Demo.git?ref=1"), "https://github.com/okavo/demo");
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
