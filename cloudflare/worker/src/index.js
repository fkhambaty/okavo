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
import { allowedOrigin, HttpError, json, readJson } from "./http.js";
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
  examControls,
  examPaused,
  externalProofs,
  fundMilestone,
  hireFeePaid,
  identityUnavailable,
  insights,
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
  submitInterview,
  submitMilestone,
  termsAccepted,
  unconsumedPosting,
  verificationQueue,
  writeClientAudit,
} from "./marketplace.js";
import { confirmOrder, createOrder, paymentStatus, webhook } from "./payments.js";

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
        return json({ ok: true, service: "okavo", payments: env.RAZORPAY_PAYMENTS_ENABLED === "true" }, 200, origin);
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
      if (request.method === "POST" && params) return json(await fundMilestone(db, user, params.id, await readJson(request)), 200, origin);
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
      if (request.method === "POST" && path === "/v1/identity") return identityUnavailable();
      if (request.method === "GET" && path === "/v1/admin/verifications") return json(await verificationQueue(db, user), 200, origin);
      params = match(path, "/v1/admin/verifications/:id");
      if (request.method === "POST" && params) return json(await decideVerification(db, user, params.id, await readJson(request)), 200, origin);
      if (request.method === "GET" && path === "/v1/admin/insights") return json(await insights(db, user), 200, origin);
      if (request.method === "GET" && path === "/v1/admin/operations") return json(await operationsHealth(db, user), 200, origin);
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
      if (request.method === "GET" && path === "/v1/exams/mine") return json({ exam: null }, 200, origin);
      if (request.method === "GET" && path === "/v1/exams/open") return json({ exams: [] }, 200, origin);
      if (path.startsWith("/v1/exams")) examPaused();
      if (request.method === "POST" && path === "/v1/payments/razorpay/order") {
        return json(await createOrder(db, env, request, user, await readJson(request)), 200, origin);
      }
      if (request.method === "POST" && path === "/v1/payments/razorpay/confirm") {
        return json(await confirmOrder(db, env, user, await readJson(request)), 200, origin);
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
      return json({ error: "The database did not accept that request." }, 500, origin);
    }
  },
};
