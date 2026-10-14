import {
  changePassword,
  login,
  logout,
  me,
  recovery,
  refresh,
  resend,
  resetPassword,
  signup,
  userFromRequest,
  verify,
} from "./auth.js";
import {
  askExam,
  decideExam,
  examControls,
  holdExam,
  myExam,
  openExams,
  replyExam,
  scoreExam,
  setExamControls,
  startExam,
  submitExam,
} from "./exams.js";
import { purgeExpiredIdentityFiles, readPrivateFile } from "./files.js";
import { allowedOrigin, fileResponse, HttpError, json, readJson } from "./http.js";
import {
  acceptInvite,
  acceptMilestone,
  acceptTerms,
  analyticsBreakdown,
  analyticsDaily,
  analyticsOverview,
  answerClarification,
  askClarification,
  auditBuckets,
  auditEvents,
  awardBid,
  clarifications,
  collectVisit,
  countersign,
  createChangeOrder,
  decideChangeOrder,
  decideVerification,
  developerAccount,
  developerListing,
  developerReviews,
  directory,
  externalProofs,
  fundMilestone,
  hireFeePaid,
  insights,
  liquidity,
  inviteBuilder,
  leaveReview,
  listBlocks,
  listNotifications,
  listProjects,
  listThreads,
  lockProject,
  markRead,
  openThread,
  operationsEvents,
  operationsHealth,
  placeBid,
  postingCount,
  priceChangeOrder,
  publishProject,
  raiseDispute,
  requestBlock,
  resolveDispute,
  reviewBlock,
  sendMessage,
  setBidStatus,
  submitIdentity,
  submitInterview,
  submitMilestone,
  termsAccepted,
  unconsumedPosting,
  verificationQueue,
  writeClientAudit,
} from "./marketplace.js";
import { confirmOrder, confirmPaymentLink, createHostedLink, createOrder, paymentStatus, quoteFee, reconcilePending, webhook } from "./payments.js";
import { checkoutMode, mailConfigured, opsAuthStatus, secretConfigured, storageBackend } from "./pure.js";

function d1DailyLimitReached(error) {
  return /exceeded D1's free tier daily row (?:write|read) limit/i.test(String(error?.message || ""));
}

async function mailDomainVerified(env) {
  if (!mailConfigured(env)) return false;
  const domain = (String(env.MAIL_FROM).match(/@([^>\s]+)/) || [])[1]?.toLowerCase();
  const response = await fetch("https://api.resend.com/domains", {
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}` },
  }).catch(() => null);
  if (!response || !response.ok) return null;
  return ((await response.json()).data || []).some((d) => d.name === domain && d.status === "verified");
}

function match(path, pattern) {
  const names = [];
  const source = pattern
    .split("/")
    .map((part) => {
      if (part.startsWith(":")) {
        names.push(part.slice(1));
        return "([^/]+)";
      }
      return part;
    })
    .join("/");
  const found = new RegExp(`^${source}$`).exec(path);
  if (!found) return null;
  const params = {};
  names.forEach((name, index) => {
    params[name] = decodeURIComponent(found[index + 1]);
  });
  return params;
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request);
    if (origin === null) return json({ error: "Origin not allowed" }, 403, "");
    if (request.method === "OPTIONS") return json({ ok: true }, 204, origin);

    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.DB;

    try {
      if (request.method === "GET" && path === "/v1/health") {
        return json({
          ok: true,
          service: "okavo",
          payments: env.RAZORPAY_PAYMENTS_ENABLED === "true",
          checkout: checkoutMode(env),
          storage: storageBackend(env),
          r2Enabled: storageBackend(env) === "r2",
          mailConfigured: mailConfigured(env),
          mailDomainVerified: await mailDomainVerified(env),
          analyticsIngestConfigured: secretConfigured(env.ANALYTICS_INGEST_SECRET),
          paymentModel: "attestation",
        }, 200, origin);
      }
      if (request.method === "GET" && path === "/v1/payments/quote") {
        return json(quoteFee(env, url.searchParams.get("purpose") || ""), 200, origin);
      }

      if (request.method === "POST" && path === "/v1/auth/signup") {
        return json(await signup(db, env, request, await readJson(request)), 201, origin);
      }
      if (request.method === "POST" && path === "/v1/auth/verify") {
        return json(await verify(db, env, await readJson(request)), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/auth/resend") {
        return json(await resend(db, env, await readJson(request)), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/auth/login") {
        return json(await login(db, env, request, await readJson(request)), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/auth/refresh") {
        const body = await readJson(request);
        return json(await refresh(db, body?.refresh_token), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/auth/logout") {
        const body = await readJson(request);
        return json(await logout(db, request, body?.refresh_token), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/auth/recovery") {
        return json(await recovery(db, env, request, await readJson(request)), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/auth/reset") {
        return json(await resetPassword(db, await readJson(request)), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/analytics/collect") {
        return json(await collectVisit(db, env, request, await readJson(request)), 201, origin);
      }
      if (request.method === "POST" && path === "/v1/payments/razorpay/webhook") {
        return json(await webhook(db, env, request, await request.text()), 200, origin);
      }
      if (request.method === "POST" && (path === "/v1/ops/reconcile" || path === "/v1/ops/retention")) {
        const auth = opsAuthStatus(env, request.headers.get("x-okavo-ops") || "");
        if (auth === "misconfigured") return json({ error: "ops_secret_missing" }, 503, origin);
        if (auth !== "ok") return json({ error: "Unauthorized" }, 401, origin);
        if (path === "/v1/ops/retention") {
          const purged = await purgeExpiredIdentityFiles(db, env);
          return json({ ok: true, purged, storage: storageBackend(env) }, 200, origin);
        }
        const body = await readJson(request);
        return json(await reconcilePending(db, env, { apply: body?.apply === true }), 200, origin);
      }

      const user = await userFromRequest(request, db);

      if (request.method === "GET" && path === "/v1/me") return json(await me(db, user), 200, origin);
      if (request.method === "POST" && path === "/v1/auth/password") {
        return json(await changePassword(db, user, await readJson(request)), 200, origin);
      }
      if (request.method === "GET" && path === "/v1/projects") return json(await listProjects(db, user), 200, origin);
      if (request.method === "POST" && path === "/v1/projects") {
        return json(await publishProject(db, user, await readJson(request)), 201, origin);
      }
      let params = match(path, "/v1/projects/:id/lock");
      if (request.method === "POST" && params) return json(await lockProject(db, user, params.id, await readJson(request)), 200, origin);
      params = match(path, "/v1/projects/:id/bids");
      if (request.method === "POST" && params) return json(await placeBid(db, user, params.id, await readJson(request)), 201, origin);
      params = match(path, "/v1/bids/:id/status");
      if (request.method === "POST" && params) return json(await setBidStatus(db, user, params.id, await readJson(request)), 200, origin);
      params = match(path, "/v1/bids/:id/award");
      if (request.method === "POST" && params) return json(await awardBid(db, user, params.id), 200, origin);
      params = match(path, "/v1/bids/:id/hire-fee");
      if (request.method === "GET" && params) return json(await hireFeePaid(db, user, params.id), 200, origin);
      if (request.method === "GET" && path === "/v1/posting-fees") return json(await postingCount(db, user), 200, origin);
      if (request.method === "GET" && path === "/v1/posting-fees/unconsumed") return json(await unconsumedPosting(db, user), 200, origin);
      if (request.method === "GET" && path === "/v1/developers") return json(await directory(db, user), 200, origin);
      params = match(path, "/v1/developers/:id/reviews");
      if (request.method === "GET" && params) return json(await developerReviews(db, user, params.id), 200, origin);
      params = match(path, "/v1/developers/:id");
      if (request.method === "GET" && params) return json(await developerListing(db, user, params.id), 200, origin);
      if (request.method === "GET" && path === "/v1/developer/account") return json(await developerAccount(db, user), 200, origin);
      if (request.method === "POST" && path === "/v1/developer/interview") return json(await submitInterview(db, user), 200, origin);
      if (request.method === "GET" && path === "/v1/threads") return json(await listThreads(db, user), 200, origin);
      if (request.method === "POST" && path === "/v1/threads") return json(await openThread(db, user, await readJson(request)), 200, origin);
      params = match(path, "/v1/threads/:id/messages");
      if (request.method === "POST" && params) return json(await sendMessage(db, user, params.id, await readJson(request)), 201, origin);
      if (request.method === "GET" && path === "/v1/notifications") return json(await listNotifications(db, user), 200, origin);
      if (request.method === "POST" && path === "/v1/notifications/read") return json(await markRead(db, user, null), 200, origin);
      params = match(path, "/v1/notifications/:id/read");
      if (request.method === "POST" && params) return json(await markRead(db, user, params.id), 200, origin);
      params = match(path, "/v1/projects/:id/countersign");
      if (request.method === "POST" && params) return json(await countersign(db, user, params.id), 200, origin);
      params = match(path, "/v1/milestones/:id/submit");
      if (request.method === "POST" && params) return json(await submitMilestone(db, user, params.id, await readJson(request)), 200, origin);
      params = match(path, "/v1/milestones/:id/accept");
      if (request.method === "POST" && params) return json(await acceptMilestone(db, user, params.id), 200, origin);
      params = match(path, "/v1/milestones/:id/fund");
      if (request.method === "POST" && params) return json(await fundMilestone(db, user, params.id, await readJson(request), env), 200, origin);
      if (request.method === "GET" && path === "/v1/milestone-proofs") {
        const ids = (url.searchParams.get("ids") || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 50);
        return json(await externalProofs(db, user, ids), 200, origin);
      }
      params = match(path, "/v1/projects/:id/change-orders");
      if (request.method === "POST" && params) return json(await createChangeOrder(db, user, params.id, await readJson(request)), 201, origin);
      params = match(path, "/v1/change-orders/:id/price");
      if (request.method === "POST" && params) return json(await priceChangeOrder(db, user, params.id, await readJson(request)), 200, origin);
      params = match(path, "/v1/change-orders/:id/decide");
      if (request.method === "POST" && params) return json(await decideChangeOrder(db, user, params.id, await readJson(request)), 200, origin);
      params = match(path, "/v1/projects/:id/disputes");
      if (request.method === "POST" && params) return json(await raiseDispute(db, user, params.id, await readJson(request)), 201, origin);
      params = match(path, "/v1/disputes/:id/resolve");
      if (request.method === "POST" && params) return json(await resolveDispute(db, user, params.id, await readJson(request)), 200, origin);
      params = match(path, "/v1/projects/:id/reviews");
      if (request.method === "POST" && params) return json(await leaveReview(db, user, params.id, await readJson(request)), 201, origin);
      params = match(path, "/v1/projects/:id/clarifications");
      if (request.method === "GET" && params) return json(await clarifications(db, user, params.id), 200, origin);
      if (request.method === "POST" && params) return json(await askClarification(db, user, params.id, await readJson(request)), 201, origin);
      params = match(path, "/v1/clarifications/:id/answer");
      if (request.method === "POST" && params) return json(await answerClarification(db, user, params.id, await readJson(request)), 200, origin);
      if (request.method === "POST" && path === "/v1/terms") return json(await acceptTerms(db, user, await readJson(request)), 200, origin);
      if (request.method === "GET" && path === "/v1/terms") {
        return json(await termsAccepted(db, user, url.searchParams.get("version") || ""), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/blocks") return json(await requestBlock(db, user, await readJson(request)), 201, origin);
      if (request.method === "GET" && path === "/v1/blocks") {
        return json(await listBlocks(db, user, url.searchParams.get("status") || "open"), 200, origin);
      }
      params = match(path, "/v1/blocks/:id/review");
      if (request.method === "POST" && params) return json(await reviewBlock(db, user, params.id, await readJson(request)), 200, origin);
      if (request.method === "POST" && path === "/v1/identity") {
        return json(await submitIdentity(db, user, await readJson(request), env), 201, origin);
      }
      params = match(path, "/v1/files/:id");
      if (request.method === "GET" && params) {
        const file = await readPrivateFile(db, user, params.id, env);
        return fileResponse(file.bytes, file.mime, origin);
      }
      if (request.method === "GET" && path === "/v1/admin/verifications") return json(await verificationQueue(db, user, env), 200, origin);
      params = match(path, "/v1/admin/verifications/:id");
      if (request.method === "POST" && params) return json(await decideVerification(db, user, params.id, await readJson(request)), 200, origin);
      if (request.method === "GET" && path === "/v1/admin/insights") return json(await insights(db, user), 200, origin);
      if (request.method === "GET" && path === "/v1/admin/liquidity") return json(await liquidity(db, user), 200, origin);
      if (request.method === "GET" && path === "/v1/admin/operations") return json(await operationsHealth(db, user, env), 200, origin);
      if (request.method === "GET" && path === "/v1/admin/operations/events") {
        return json(await operationsEvents(db, user, url.searchParams.get("limit")), 200, origin);
      }
      if (request.method === "GET" && path === "/v1/admin/audit/buckets") return json(await auditBuckets(db, user), 200, origin);
      if (request.method === "GET" && path === "/v1/admin/audit") {
        return json(
          await auditEvents(db, user, url.searchParams.get("bucket") || "7d", url.searchParams.get("limit"), url.searchParams.get("offset")),
          200,
          origin,
        );
      }
      if (request.method === "GET" && path === "/v1/admin/analytics/overview") {
        return json(await analyticsOverview(db, user, url.searchParams.get("days")), 200, origin);
      }
      if (request.method === "GET" && path === "/v1/admin/analytics/breakdown") {
        return json(
          await analyticsBreakdown(db, user, url.searchParams.get("dimension") || "", url.searchParams.get("days"), url.searchParams.get("max")),
          200,
          origin,
        );
      }
      if (request.method === "GET" && path === "/v1/admin/analytics/daily") {
        return json(await analyticsDaily(db, user, url.searchParams.get("days")), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/audit") return json(await writeClientAudit(db, user, await readJson(request)), 200, origin);
      if (request.method === "GET" && path === "/v1/exams/controls") return json(await examControls(db, user), 200, origin);
      if (request.method === "POST" && path === "/v1/exams/controls") {
        return json(await setExamControls(db, user, await readJson(request)), 200, origin);
      }
      if (request.method === "GET" && path === "/v1/exams/mine") return json(await myExam(db, user), 200, origin);
      if (request.method === "GET" && path === "/v1/exams/open") return json(await openExams(db, user), 200, origin);
      if (request.method === "POST" && path === "/v1/exams/start") return json(await startExam(db, user), 201, origin);
      params = match(path, "/v1/exams/:id/submit");
      if (request.method === "POST" && params) return json(await submitExam(db, user, params.id, await readJson(request)), 200, origin);
      params = match(path, "/v1/exams/:id/reply");
      if (request.method === "POST" && params) return json(await replyExam(db, user, params.id, await readJson(request)), 200, origin);
      params = match(path, "/v1/exams/:id/score");
      if (request.method === "POST" && params) return json(await scoreExam(db, user, params.id), 200, origin);
      params = match(path, "/v1/exams/:id/ask");
      if (request.method === "POST" && params) return json(await askExam(db, user, params.id, await readJson(request)), 200, origin);
      params = match(path, "/v1/exams/:id/hold");
      if (request.method === "POST" && params) return json(await holdExam(db, user, params.id, await readJson(request)), 200, origin);
      params = match(path, "/v1/exams/:id/decide");
      if (request.method === "POST" && params) return json(await decideExam(db, user, params.id, await readJson(request)), 200, origin);
      if (request.method === "POST" && path === "/v1/payments/razorpay/order") {
        return json(await createOrder(db, env, request, user, await readJson(request)), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/payments/razorpay/confirm") {
        return json(await confirmOrder(db, env, user, await readJson(request)), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/payments/razorpay/link") {
        return json(await createHostedLink(db, env, user, await readJson(request)), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/payments/razorpay/link-return") {
        return json(await confirmPaymentLink(db, env, user, await readJson(request)), 200, origin);
      }
      params = match(path, "/v1/payments/:id");
      if (request.method === "GET" && params) return json(await paymentStatus(db, user, params.id), 200, origin);
      params = match(path, "/v1/projects/:id/invites");
      if (request.method === "POST" && params) return json(await inviteBuilder(db, env, user, params.id, await readJson(request)), 200, origin);
      if (request.method === "POST" && path === "/v1/invites/accept") {
        return json(await acceptInvite(db, user, await readJson(request)), 200, origin);
      }

      return json({ error: "Not found", unimplemented: true }, 404, origin);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status, origin);
      console.error("request failed", request.method, path, error?.name || "Error", error?.message || "unknown");
      if (d1DailyLimitReached(error)) {
        return json(
          { error: "Accounts and saved work are temporarily unavailable because today's storage allowance has been reached. Nothing was charged. Please try again after the daily reset." },
          503,
          origin,
        );
      }
      return json({ error: "The database did not accept that request." }, 500, origin);
    }
  },

  async scheduled(_event, env, ctx) {
    const db = env.DB;
    ctx.waitUntil(purgeExpiredIdentityFiles(db, env));
    ctx.waitUntil(reconcilePending(db, env, { apply: env.ALLOW_PAYMENT_RECONCILIATION === "true" }));
  },
};
