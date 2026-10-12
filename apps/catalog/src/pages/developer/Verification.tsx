import { useCallback, useEffect, useState } from "react";
import IdentityUpload from "./IdentityUpload";
import * as api from "../../lib/api";
import { collectFee } from "../../lib/checkout";
import * as examApi from "../../lib/exam";
import {
  EXAM_AUTO_APPROVE_MIN_SCORE,
  EXAM_DAILY_START_CAP,
  EXAM_WINDOW_HOURS,
  type BuildExam,
  type ExamControls,
} from "../../lib/exam";
import { checkGuardrails } from "../../lib/guardrails";
import { MEMBERSHIP_FEE_LABEL, MEMBERSHIP_SETTLEMENT_HINT } from "../../lib/pricing";
import { REVIEW_CRITERIA, formatRating } from "../../lib/reviewCriteria";
import { getAccessToken } from "../../lib/sessionClient";
import { useStore } from "../../store";
import type { DeveloperListing } from "../../types";

const IDENTITY_LABEL: Record<string, string> = {
  not_started: "Not started",
  submitted: "In review",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

export default function Verification() {
  const {
    name,
    email,
    userId,
    developerAccount,
    payMembership,
    refresh,
    connected,
  } = useStore();
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [listing, setListing] = useState<DeveloperListing | null>(null);
  const [exam, setExam] = useState<BuildExam | null>(null);
  const [examBusy, setExamBusy] = useState(false);
  const [examError, setExamError] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [examReply, setExamReply] = useState("");
  const [examControls, setExamControls] = useState<ExamControls | null>(null);

  const loadExam = useCallback(async () => {
    if (!connected) return;
    try {
      const [nextExam, controls] = await Promise.all([
        examApi.fetchMyBuildExam(),
        examApi.fetchExamControls(),
      ]);
      setExam(nextExam);
      setExamControls(controls);
    } catch {
      // Page still works without exam fetch.
    }
  }, [connected]);

  useEffect(() => {
    void loadExam();
  }, [loadExam, developerAccount.interviewStatus]);

  useEffect(() => {
    if (!connected || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const record = await api.fetchDeveloperListing(userId);
        if (!cancelled) setListing(record);
      } catch {
        // The rest of the page works without the delivery record.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, userId, developerAccount.membershipPaid]);

  const identityStatus = developerAccount.identityStatus;
  const identityApproved = identityStatus === "approved";
  const examApproved = developerAccount.interviewStatus === "approved";

  useEffect(() => {
    if (developerAccount.membershipPaid) setPaying(false);
  }, [developerAccount.membershipPaid]);

  async function startMembershipCheckout() {
    if (!connected) {
      setPayError(null);
      payMembership();
      return;
    }

    setPaying(true);
    setPayError(null);
    const result = await collectFee("bidding_membership", { name, email });

    if (result.status === "paid") {
      // razorpay-confirm has marked the fee paid and unlocked bidding.
      await refresh();
      setPaying(false);
      return;
    }

    setPaying(false);
    if (result.status === "cancelled") {
      setPayError("Payment was cancelled. Bidding is still locked.");
    } else if (result.status === "pending") {
      setPayError(
        "Your bank is still confirming the payment. Refresh this page in a moment — do not pay again."
      );
    } else {
      setPayError(result.message);
    }
  }

  return (
    <>
      <header className="topbar">
        <h1>Verification and membership</h1>
        <div className="topbar-actions">
          {developerAccount.membershipPaid ? (
            <span className="badge badge-lock">Bidding active</span>
          ) : (
            <span className="badge badge-draft">Bidding locked</span>
          )}
        </div>
      </header>

      <div className="content content-narrow">
        <div className="stack">
          <div
            className={
              developerAccount.membershipPaid
                ? "card membership paid"
                : "card membership"
            }
          >
            <div className="membership-body">
              <div>
                <h2>One-time bidding membership</h2>
                <p>
                  {developerAccount.membershipPaid
                    ? `Paid on ${developerAccount.membershipPaidAt}. ${
                        identityApproved && examApproved
                          ? "Identity and build exam are approved — you can bid."
                          : "Membership is paid. Finish identity + build exam before you can bid."
                      }`
                    : "Pay once to unlock bidding after identity and the build exam are approved."}
                </p>
              </div>
              <div className="membership-price">
                <strong>{MEMBERSHIP_FEE_LABEL}</strong>
                <span>one time</span>
              </div>
            </div>

            {!developerAccount.membershipPaid && (
              <div className="membership-foot">
                <ul className="membership-list">
                  <li>Unlimited bids on locked requirements</li>
                  <li>Same frozen scope every bidder sees</li>
                  <li>
                    Buyer pays you milestone by milestone after accepting work
                    (Okavo does not hold build funds)
                  </li>
                  <li>Non-refundable, charged once per account</li>
                </ul>

                {payError && (
                  <div className="callout callout-warn" role="alert">
                    <span>!</span>
                    <span>{payError}</span>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-lg"
                  onClick={startMembershipCheckout}
                  disabled={paying}
                >
                  {paying
                    ? "Opening payment…"
                    : connected
                      ? `Pay ${MEMBERSHIP_FEE_LABEL} and activate bidding`
                      : "Activate demo bidding — no charge"}
                </button>
                <span className="hint">
                  {connected
                    ? `Secure payment by Razorpay. Okavo never sees your card details. ${MEMBERSHIP_SETTLEMENT_HINT}`
                    : "Demo mode simulates activation and never opens a payment window."}
                </span>
              </div>
            )}

            {developerAccount.membershipPaid && (
              <div className="membership-foot">
                <div
                  className={
                    identityApproved && examApproved
                      ? "callout callout-ok"
                      : "callout callout-warn"
                  }
                >
                  <span>{identityApproved && examApproved ? "✓" : "!"}</span>
                  <span>
                    {identityApproved && examApproved
                      ? "Membership active. You can bid on locked requirements."
                      : "Membership paid. Bidding opens after government ID and the build exam are both approved."}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Government ID</h2>
              <span
                className={
                  identityApproved
                    ? "badge badge-lock"
                    : identityStatus === "rejected"
                      ? "badge badge-danger"
                      : "badge badge-draft"
                }
              >
                {IDENTITY_LABEL[identityStatus] ?? identityStatus}
              </span>
            </div>
            <div style={{ padding: "1.25rem" }}>
              {identityApproved ? (
                <>
                  <div className="verify-item">
                    <span className="verify-icon">✓</span>
                    <div>
                      <strong>Identity confirmed</strong>
                      <p>
                        Your document passed review. Buyers see a verified badge,
                        never the document itself.
                      </p>
                    </div>
                  </div>
                  <div className="verify-item">
                    <span className="verify-icon pending">•</span>
                    <div>
                      <strong>Annual re-verification</strong>
                      <p>You will be reminded 30 days before it is due.</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ color: "var(--body)", marginBottom: "1.25rem" }}>
                    Bidding requires a verified identity. This is what makes a
                    buyer in another country comfortable sending you money.
                  </p>
                  <IdentityUpload status={identityStatus} onSubmitted={refresh} />
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Build exam (required to bid)</h2>
              {developerAccount.interviewStatus === "approved" ? (
                <span className="badge badge-lock">Approved</span>
              ) : (
                <span className="badge badge-draft">
                  {exam?.status?.replace(/_/g, " ") ?? "Not started"}
                </span>
              )}
            </div>
            <div style={{ padding: "1.25rem" }}>
              <div className="callout callout-warn" style={{ marginBottom: "1rem" }}>
                <span>!</span>
                <span>
                  Anyone can register. Bidding needs (1) approved government ID,
                  (2) this timed build exam, (3) membership. You get a random brief
                  from Okavo’s bank, <strong>5 hours</strong> to ship a public
                  GitHub repo + live URL (Vercel or similar). Okavo safely
                  checks the public links; an admin may ask questions.{" "}
                  <strong>
                    After 48 hours, auto-approval happens only when the score is{" "}
                    {EXAM_AUTO_APPROVE_MIN_SCORE} or higher and no safety hold or
                    admin pause is active
                  </strong>{" "}
                  . A missing or lower score waits for a person. Up to{" "}
                  {EXAM_DAILY_START_CAP} exams can start each UTC day.
                </span>
              </div>

              {examError && (
                <div className="callout callout-warn" role="alert">
                  <span>!</span>
                  <span>{examError}</span>
                </div>
              )}

              {developerAccount.interviewStatus === "approved" && (
                <div className="callout callout-ok">
                  <span>✓</span>
                  <span>
                    Build exam approved
                    {exam?.autoApprovedAt
                      ? ` (auto-approved after the 48-hour admin window with a score of at least ${EXAM_AUTO_APPROVE_MIN_SCORE}).`
                      : "."}{" "}
                    You can bid once membership is paid and identity is approved.
                  </span>
                </div>
              )}

              {(exam?.status === "rejected" || exam?.status === "expired") && (
                <div className="callout callout-warn" style={{ marginBottom: "1rem" }}>
                  <span>!</span>
                  <span>
                    {exam.status === "expired"
                      ? "That exam window ended. Start a new one when you can focus for five hours."
                      : `The last exam was not accepted${exam.reviewerNotes ? `: ${exam.reviewerNotes}` : "."} You can start another.`}
                  </span>
                </div>
              )}

              {(!exam || exam.status === "rejected" || exam.status === "expired") &&
                developerAccount.interviewStatus !== "approved" && (
                <>
                  <p style={{ color: "var(--body)" }}>
                    Start only when you can focus for up to five hours. Leaving
                    the page does not pause the clock.
                  </p>
                  {examControls?.startsPaused && (
                    <div className="callout callout-warn">
                      <span>!</span>
                      <span>
                        New starts are temporarily paused. Your verification is
                        safe; try again later.
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn"
                    disabled={
                      examBusy ||
                      !identityApproved ||
                      examControls?.startsPaused === true
                    }
                    onClick={() => {
                      void (async () => {
                        setExamBusy(true);
                        setExamError(null);
                        try {
                          await examApi.startBuildExam();
                          await loadExam();
                          await refresh();
                        } catch (cause) {
                          setExamError(
                            cause instanceof Error
                              ? cause.message
                              : "Could not start exam"
                          );
                        } finally {
                          setExamBusy(false);
                        }
                      })();
                    }}
                  >
                    {examBusy
                      ? "Starting…"
                      : examControls?.startsPaused
                        ? "Exam starts paused"
                        : identityApproved
                        ? "Start 5-hour build exam"
                        : "Approve ID first"}
                  </button>
                </>
              )}

              {exam && exam.status === "in_progress" && exam.brief && (
                <>
                  <p className="hint">
                    Due by {new Date(exam.dueAt).toLocaleString()} (
                    {EXAM_WINDOW_HOURS}h window).
                  </p>
                  <h3 style={{ marginTop: "0.75rem" }}>{exam.brief.title}</h3>
                  <p>{exam.brief.summary}</p>
                  <p>
                    <strong>Acceptance:</strong> {exam.brief.acceptance}
                  </p>
                  <p className="hint">Stack hint: {exam.brief.stackHint}</p>
                  <div className="field">
                    <label htmlFor="gh">GitHub / GitLab URL</label>
                    <input
                      id="gh"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/you/exam-app"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="live">Live URL</label>
                    <input
                      id="live"
                      value={liveUrl}
                      onChange={(e) => setLiveUrl(e.target.value)}
                      placeholder="https://your-app.vercel.app"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn"
                    disabled={examBusy}
                    onClick={() => {
                      void (async () => {
                        setExamBusy(true);
                        setExamError(null);
                        try {
                          await examApi.submitBuildExam(
                            exam.id,
                            githubUrl.trim(),
                            liveUrl.trim()
                          );
                          const accessToken = await getAccessToken();
                          if (accessToken) {
                            await examApi.requestExamAnalysis(
                              exam.id,
                              accessToken
                            );
                          }
                          await loadExam();
                          await refresh();
                        } catch (cause) {
                          setExamError(
                            cause instanceof Error
                              ? cause.message
                              : "Submit failed"
                          );
                        } finally {
                          setExamBusy(false);
                        }
                      })();
                    }}
                  >
                    {examBusy ? "Submitting…" : "Submit exam"}
                  </button>
                </>
              )}

              {exam &&
                (exam.status === "submitted" ||
                  exam.status === "admin_questions") && (
                  <>
                    <p>
                      Submitted. Admin review window ends{" "}
                      {exam.reviewDeadlineAt
                        ? new Date(exam.reviewDeadlineAt).toLocaleString()
                        : "within 48 hours"}
                      .
                    </p>
                    {exam.autoScoreOverall === null && (
                      <p className="hint">
                        No score is available yet, so this exam stays in manual
                        review and will not auto-approve.
                      </p>
                    )}
                    {exam.autoScoreOverall !== null && (
                      <p className="hint">
                        Auto-score assist: {exam.autoScoreOverall}/100.{" "}
                        {exam.autoScoreOverall >= EXAM_AUTO_APPROVE_MIN_SCORE
                          ? "This meets the score threshold."
                          : `This is below ${EXAM_AUTO_APPROVE_MIN_SCORE}, so it stays in manual review.`}
                      </p>
                    )}
                    {exam.autoScoreOverall !== null &&
                      exam.autoScoreOverall >= EXAM_AUTO_APPROVE_MIN_SCORE && (
                        <p className="hint">
                          {examControls?.autoApprovePaused
                            ? "Auto-approvals are temporarily paused; an admin can still decide manually."
                            : exam.autoApprovalHold
                              ? "An admin placed this exam on hold for manual review."
                              : "If no admin decides by the deadline, this exam can auto-approve."}
                        </p>
                      )}
                    {exam.status === "admin_questions" && exam.adminQuestion && (
                      <>
                        <p>
                          <strong>Admin question:</strong> {exam.adminQuestion}
                        </p>
                        <div className="field">
                          <label htmlFor="reply">Your reply</label>
                          <textarea
                            id="reply"
                            rows={3}
                            value={examReply}
                            onChange={(e) => setExamReply(e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={examBusy}
                          onClick={() => {
                            void (async () => {
                              setExamBusy(true);
                              try {
                                const guard = checkGuardrails(
                                  "exam_reply",
                                  examReply
                                );
                                if (!guard.ok) {
                                  setExamError(guard.message);
                                  return;
                                }
                                await examApi.replyBuildExam(
                                  exam.id,
                                  examReply.trim()
                                );
                                setExamReply("");
                                await loadExam();
                              } catch (cause) {
                                setExamError(
                                  cause instanceof Error
                                    ? cause.message
                                    : "Reply failed"
                                );
                              } finally {
                                setExamBusy(false);
                              }
                            })();
                          }}
                        >
                          Send reply
                        </button>
                      </>
                    )}
                  </>
                )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Your delivery record</h2>
              <span className="badge badge-accent">
                {formatRating(listing?.rating ?? null)} / 5
              </span>
            </div>
            <div style={{ padding: "1.25rem" }}>
              <p className="hint" style={{ marginBottom: "1rem" }}>
                This is exactly what a buyer sees next to your bid. It is built
                from closed contracts only — nothing here can be self-reported.
              </p>
              <div className="stat-row" style={{ marginBottom: 0 }}>
                <div className="stat">
                  <span>Contracts delivered</span>
                  <strong>{listing?.contractsDelivered ?? 0}</strong>
                </div>
                <div className="stat">
                  <span>Reviews</span>
                  <strong>{listing?.reviewCount ?? 0}</strong>
                </div>
                <div className="stat">
                  <span>Locked scope delivered</span>
                  <strong>
                    {listing?.lockedScopeRate === null ||
                    listing?.lockedScopeRate === undefined
                      ? "—"
                      : `${listing.lockedScopeRate}%`}
                  </strong>
                </div>
                <div className="stat">
                  <span>Overall rating</span>
                  <strong>{formatRating(listing?.rating ?? null)}</strong>
                </div>
              </div>

              {listing && listing.reviewCount > 0 && (
                <div className="score-grid" style={{ marginBottom: 0 }}>
                  {REVIEW_CRITERIA.map((criterion) => (
                    <div className="score-cell" key={criterion.key}>
                      <span>{criterion.short}</span>
                      <strong>
                        {formatRating(listing.criteria[criterion.key])}
                      </strong>
                    </div>
                  ))}
                </div>
              )}

              {listing?.reviewCount === 0 && (
                <p className="hint" style={{ marginTop: "1rem" }}>
                  No reviews yet. Your first closed contract starts this record.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
