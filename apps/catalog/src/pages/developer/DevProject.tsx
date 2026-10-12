import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import ContractPanel from "../../components/ContractPanel";
import { money } from "../../format";
import * as api from "../../lib/api";
import { MEMBERSHIP_FEE_LABEL } from "../../lib/pricing";
import { useStore } from "../../store";

export default function DevProject() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { projects, placeBid, developerAccount, email, userId, connected } =
    useStore();
  const project = projects.find((p) => p.id === id);

  const [amount, setAmount] = useState("");
  const [monthly, setMonthly] = useState("");
  const [weeks, setWeeks] = useState("");
  const [note, setNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [clarifications, setClarifications] = useState<
    api.ClarificationRequest[]
  >([]);
  const [question, setQuestion] = useState("");
  const [questionScopeId, setQuestionScopeId] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const token = searchParams.get("invite");
    if (!token || !email) return;
    let cancelled = false;
    void (async () => {
      try {
        await api.acceptProjectInvite(token);
        if (!cancelled) {
          setInviteNote("Invite accepted. You can bid on this locked brief.");
        }
      } catch (cause) {
        if (!cancelled) {
          setInviteNote(
            cause instanceof Error
              ? cause.message
              : "Could not accept this invite."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, email]);

  useEffect(() => {
    if (!connected || !id) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await api.fetchClarifications(id);
        if (!cancelled) setClarifications(rows);
      } catch {
        // Board still usable without Q&A overlay.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, id]);

  if (!project) {
    return (
      <>
        <header className="topbar">
          <h1>Project</h1>
        </header>
        <div className="content">
          <div className="card empty">
            <strong>This project is no longer listed</strong>
            <Link to="/app">Back to board</Link>
          </div>
        </div>
      </>
    );
  }

  const clarifying = project.stage === "clarifying";
  const frozen = project.stage === "locked";
  const identityApproved = developerAccount.identityStatus === "approved";
  const examApproved = developerAccount.interviewStatus === "approved";
  const canBid =
    frozen && developerAccount.membershipPaid && identityApproved && examApproved;
  const myExistingBid = project.bids.find(
    (bid) => bid.developerId === userId || bid.developerId === "me"
  );
  const readyToSubmit =
    canBid && accepted && amount.trim() !== "" && !submitted && !myExistingBid;
  const myAwarded = project.bids.find((bid) => bid.status === "awarded");
  const needsCountersign =
    Boolean(myAwarded) &&
    !project.developerSignedAt &&
    project.stage === "hired";

  async function submitClarification() {
    if (!project || !userId || !question.trim()) return;
    setAsking(true);
    try {
      await api.askClarification(
        project.id,
        userId,
        question.trim(),
        questionScopeId || null
      );
      setQuestion("");
      setQuestionScopeId("");
      setClarifications(await api.fetchClarifications(project.id));
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "Could not send clarification."
      );
    } finally {
      setAsking(false);
    }
  }

  async function submitBid() {
    if (!project) return;

    const bidAmount = Number(amount);
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
      setFormError("Enter a build price greater than zero.");
      return;
    }
    const bidWeeks = weeks.trim() === "" ? project.timelineWeeks : Number(weeks);
    if (!Number.isFinite(bidWeeks) || bidWeeks <= 0) {
      setFormError("Delivery time must be a positive number of weeks.");
      return;
    }
    const bidMonthly =
      monthly.trim() === "" ? project.monthlyOps : Number(monthly);
    if (!Number.isFinite(bidMonthly) || bidMonthly < 0) {
      setFormError("Monthly running cost must be zero or more.");
      return;
    }

    setFormError(null);
    setBusy(true);
    const ok = await placeBid(project.id, {
      amount: bidAmount,
      monthlyOps: bidMonthly,
      weeks: bidWeeks,
      note: note || "Bid submitted against the locked requirement.",
    });
    setBusy(false);

    if (ok) {
      setSubmitted(true);
      return;
    }
    setFormError(
      "Your bid was not accepted. Check the banner above for the reason, then try again."
    );
  }

  return (
    <>
      <header className="topbar">
        <h1>{project.title}</h1>
        <div className="topbar-actions">
          <span className="badge">{project.org}</span>
          {frozen ? (
            <span className="badge badge-lock">{project.lockId}</span>
          ) : clarifying ? (
            <span className="badge badge-accent">Q&amp;A window</span>
          ) : (
            <span className="badge badge-draft">Not on board</span>
          )}
        </div>
      </header>

      <div className="content">
        <div className="split">
          <div className="stack">
            <ContractPanel project={project} viewer="developer" />
          </div>

          <aside className="sticky-side">
            {inviteNote && (
              <div className="card card-pad" style={{ marginBottom: "1rem" }}>
                <div className="callout callout-info">
                  <span>i</span>
                  <span>{inviteNote}</span>
                </div>
              </div>
            )}
            {needsCountersign && (
              <div className="card card-pad" style={{ marginBottom: "1rem" }}>
                <div className="callout callout-warn">
                  <span>!</span>
                  <span>
                    You were hired. After the buyer funds the first milestone,
                    countersign the locked scope on the contract page.
                  </span>
                </div>
                <Link
                  className="btn btn-sm btn-block"
                  style={{ marginTop: "0.85rem" }}
                  to={`/app/contract/${project.id}`}
                >
                  Open contract
                </Link>
              </div>
            )}
            {clarifying && (
              <div className="card card-pad" style={{ marginBottom: "1rem" }}>
                <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.6rem" }}>
                  Pre-lock clarifications
                </h3>
                <p style={{ color: "var(--muted)", marginBottom: "0.75rem" }}>
                  Ask line-item questions now. Bids open only after the buyer
                  freezes (recommended ~48h Q&amp;A).
                </p>
                <div className="field">
                  <label htmlFor="q-scope">Scope line (optional)</label>
                  <select
                    id="q-scope"
                    value={questionScopeId}
                    onChange={(e) => setQuestionScopeId(e.target.value)}
                  >
                    <option value="">Whole brief</option>
                    {project.scope
                      .filter((s) => s.included)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="q-text">Your question</label>
                  <textarea
                    id="q-text"
                    rows={3}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What must be true for this line to be accepted?"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-block"
                  disabled={asking || !question.trim()}
                  onClick={() => void submitClarification()}
                >
                  {asking ? "Sending…" : "Ask clarification"}
                </button>
                {clarifications.length > 0 && (
                  <div className="stack-sm" style={{ marginTop: "1rem" }}>
                    {clarifications.map((row) => (
                      <div key={row.id} className="callout callout-info">
                        <span>i</span>
                        <span>
                          <strong>{row.question}</strong>
                          <br />
                          {row.answer
                            ? `Buyer: ${row.answer}`
                            : "Awaiting buyer answer"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="card card-pad">
              <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.85rem" }}>
                Place your bid
              </h3>

              {!frozen && (
                <div className="callout callout-warn" style={{ marginBottom: "1rem" }}>
                  <span>!</span>
                  <span>
                    {clarifying
                      ? "This brief is in the Q&A window. Review the preview, ask clarifications, then wait for the freeze before bidding."
                      : "The buyer has not published this brief yet."}
                  </span>
                </div>
              )}

              {frozen && !identityApproved && (
                <div className="paywall" style={{ marginBottom: "1rem" }}>
                  <div>
                    <strong>Verify identity to place your first bid</strong>
                    <p>
                      Browsing and buildability checks are free. Identity is
                      required at bid time.
                    </p>
                  </div>
                  <Link className="btn btn-sm" to="/app/verification">
                    Start verification
                  </Link>
                </div>
              )}

              {frozen && identityApproved && !examApproved && (
                <div className="paywall" style={{ marginBottom: "1rem" }}>
                  <div>
                    <strong>Pass the build exam before bidding</strong>
                    <p>
                      Identity is approved. Finish the timed build exam, then
                      pay membership, before a bid can be placed.
                    </p>
                  </div>
                  <Link className="btn btn-sm" to="/app/verification">
                    Open the exam
                  </Link>
                </div>
              )}

              {frozen && identityApproved && examApproved && !developerAccount.membershipPaid && (
                <div className="paywall" style={{ marginBottom: "1rem" }}>
                  <div>
                    <strong>Pay {MEMBERSHIP_FEE_LABEL} once to bid</strong>
                    <p>
                      Required only when you submit your first bid — not to
                      review this pack.
                    </p>
                  </div>
                  <Link className="btn btn-sm" to="/app/verification">
                    Activate bidding
                  </Link>
                </div>
              )}

              {submitted || myExistingBid ? (
                <div className="callout callout-ok">
                  <span>✓</span>
                  <span>
                    Bid submitted for{" "}
                    {money(myExistingBid?.amount ?? (Number(amount) || 0))}. You
                    will be notified if the buyer shortlists you.{" "}
                    <Link to="/app/bids">View in My bids</Link>
                  </span>
                </div>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="amount">Fixed build price (USD)</label>
                    <input
                      id="amount"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder={String(project.budgetMin)}
                      disabled={!canBid}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="monthly">Monthly running cost (USD)</label>
                    <input
                      id="monthly"
                      value={monthly}
                      onChange={(event) => setMonthly(event.target.value)}
                      placeholder={String(project.monthlyOps)}
                      disabled={!canBid}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="weeks">Delivery in (weeks)</label>
                    <input
                      id="weeks"
                      value={weeks}
                      onChange={(event) => setWeeks(event.target.value)}
                      placeholder={String(project.timelineWeeks)}
                      disabled={!canBid}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="note">Message to the buyer</label>
                    <textarea
                      id="note"
                      rows={3}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="How you will deliver this exact scope."
                      disabled={!canBid}
                    />
                  </div>

                  <label className="check" style={{ marginBottom: "1rem" }}>
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(event) => setAccepted(event.target.checked)}
                      disabled={!canBid}
                    />
                    I accept the locked scope as the definition of done
                  </label>

                  {formError && (
                    <div
                      className="callout callout-warn"
                      style={{ marginBottom: "1rem" }}
                      role="alert"
                    >
                      <span>!</span>
                      <span>{formError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn btn-block"
                    disabled={!readyToSubmit || busy}
                    onClick={submitBid}
                  >
                    {busy ? "Submitting…" : "Submit bid"}
                  </button>
                </>
              )}
            </div>

            <div className="card card-pad">
              <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.6rem" }}>
                Competition
              </h3>
              <p style={{ color: "var(--muted)" }}>
                {project.publicBidCount} developers have bid on this identical
                scope.
                {project.lowestBidAmount != null &&
                  project.publicBidCount > 0 &&
                  ` Lowest ${money(project.lowestBidAmount)}.`}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
